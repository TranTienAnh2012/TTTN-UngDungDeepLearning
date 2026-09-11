/**
 * HOME DASHBOARD MODULE
 * Hiển thị danh sách Lớp học & Phòng thi dạng Card trực quan.
 * Tích hợp luồng Camera OpenCV trực tiếp qua WebSocket (STOMP Topic /topic/camera-stream)
 * Cập nhật điểm danh Real-time tức thì qua STOMP Topic /topic/attendance-events.
 */

const dashboardState = {
  currentCategory: 'class', // 'class' or 'exam'
  classSchedules: [],
  examSchedules: [],
  activeScheduleId: null,
  activeExamScheduleId: null,
  activeScheduleName: '',
  webcamStream: null,
  pollingTimer: null,
  stompClient: null,
  isCameraStreaming: false,
  attendeesList: []
};

// --- ÂM THANH THÔNG BÁO WEB AUDIO API (TỰ ĐỘNG KHÔNG CẦN FILE MP3) ---
function playSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.16); // D6
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {
    // Ignore audio context errors
  }
}

// ==========================================
// 1. WEBSOCKET & STOMP CLIENT MANAGEMENT
// ==========================================
function initStompClient() {
  if (dashboardState.stompClient && dashboardState.stompClient.connected) {
    return;
  }

  const badgeEl = document.getElementById('stomp-status-badge');
  const badgeText = document.getElementById('stomp-status-text');

  if (badgeEl && badgeText) {
    badgeEl.className = 'stomp-live-badge connecting';
    badgeText.innerText = 'STOMP: ĐANG KẾT NỐI...';
  }

  // Khởi tạo SockJS kết nối endpoint Spring Boot
  const socket = new SockJS(`${API_BASE.replace('/api', '')}/ws-attendance`);
  const stomp = Stomp.over(socket);
  stomp.debug = null; // Tắt log verbose trên console để mượt màn hình

  stomp.connect({}, (frame) => {
    console.log('[STOMP] Đã kết nối thành công WebSocket Message Broker:', frame);
    dashboardState.stompClient = stomp;

    if (badgeEl && badgeText) {
      badgeEl.className = 'stomp-live-badge';
      badgeText.innerText = '🟢 STOMP: TRỰC TIẾP';
    }

    // 1. Lắng nghe luồng khung hình OpenCV AI (/topic/camera-stream)
    stomp.subscribe('/topic/camera-stream', (message) => {
      try {
        const streamData = JSON.parse(message.body);
        renderIncomingStreamFrame(streamData);
      } catch (err) {
        console.error('Error parsing camera stream frame:', err);
      }
    });

    // 2. Lắng nghe sự kiện Điểm danh thời gian thực (/topic/attendance-events)
    stomp.subscribe('/topic/attendance-events', (message) => {
      try {
        const eventData = JSON.parse(message.body);
        handleIncomingAttendanceEvent(eventData);
      } catch (err) {
        console.error('Error handling attendance event:', err);
      }
    });

    // 3. Lắng nghe trạng thái Camera (/topic/camera-status)
    stomp.subscribe('/topic/camera-status', (message) => {
      try {
        const statusData = JSON.parse(message.body);
        handleCameraStatusChange(statusData);
      } catch (err) {
        console.error('Error parsing camera status:', err);
      }
    });

  }, (error) => {
    console.warn('[STOMP] Lỗi kết nối WebSocket:', error);
    dashboardState.stompClient = null;
    if (badgeEl && badgeText) {
      badgeEl.className = 'stomp-live-badge disconnected';
      badgeText.innerText = 'STOMP: MẤT KẾT NỐI';
    }
  });
}

function renderIncomingStreamFrame(streamData) {
  const imgEl = document.getElementById('opencv-stream-view');
  const placeholderEl = document.getElementById('opencv-stream-placeholder');
  const fpsEl = document.getElementById('stream-fps-text');
  const facesEl = document.getElementById('stream-faces-text');

  if (!imgEl) return;

  if (streamData.image) {
    imgEl.src = streamData.image;
    imgEl.style.display = 'block';
    if (placeholderEl) placeholderEl.style.display = 'none';

    if (fpsEl && streamData.fps !== undefined) {
      fpsEl.innerText = `⚡ ${Math.round(streamData.fps)} FPS`;
    }
    if (facesEl && streamData.facesCount !== undefined) {
      facesEl.innerText = `👥 ${streamData.facesCount} SV`;
    }

    dashboardState.isCameraStreaming = true;
    updateStreamButtonState(true);
  }
}

function handleIncomingAttendanceEvent(event) {
  // Kiểm tra xem sự kiện có thuộc ca học / ca thi hiện tại đang mở không
  const isCurrentSchedule = (dashboardState.activeScheduleId && String(event.scheduleId) === String(dashboardState.activeScheduleId)) ||
                            (dashboardState.activeExamScheduleId && String(event.examScheduleId) === String(dashboardState.activeExamScheduleId));

  if (!isCurrentSchedule) return;

  // Phát âm thanh thông báo
  playSuccessChime();

  // Hiển thị Toast
  showToast(`🎓 Điểm danh thành công: ${event.fullName} (${event.studentCode})`, 'success');

  // Cập nhật Result Box trên Camera View
  const nameBox = document.getElementById('focus-person-name-box');
  const descBox = document.getElementById('focus-result-desc');
  if (nameBox) {
    nameBox.innerHTML = `<span>✅</span> <span style="color: #34d399; font-weight: 700;">${event.fullName} (${event.studentCode})</span>`;
  }
  if (descBox) {
    descBox.innerHTML = `Độ tin cậy: <strong>${Math.round((event.confidence || 0.95) * 100)}%</strong> - Thời gian: ${event.checkInTime || 'Vừa xong'}`;
  }

  // Cập nhật lại danh sách điểm danh
  if (dashboardState.activeScheduleId) {
    loadFocusClassAttendance(dashboardState.activeScheduleId, true);
  } else if (dashboardState.activeExamScheduleId) {
    loadFocusExamAttendance(dashboardState.activeExamScheduleId, true);
  }
}

function handleCameraStatusChange(statusData) {
  if (statusData.status === 'STARTED') {
    dashboardState.isCameraStreaming = true;
    updateStreamButtonState(true);
    const placeholder = document.getElementById('opencv-stream-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  } else if (statusData.status === 'STOPPED') {
    dashboardState.isCameraStreaming = false;
    updateStreamButtonState(false);
    const imgEl = document.getElementById('opencv-stream-view');
    const placeholder = document.getElementById('opencv-stream-placeholder');
    if (imgEl) imgEl.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
    
    const fpsEl = document.getElementById('stream-fps-text');
    const facesEl = document.getElementById('stream-faces-text');
    if (fpsEl) fpsEl.innerText = '⚡ 0 FPS';
    if (facesEl) facesEl.innerText = '👥 0 SV';
  }
}

function updateStreamButtonState(isStreaming) {
  const btn = document.getElementById('btn-toggle-opencv-stream');
  const icon = document.getElementById('btn-toggle-stream-icon');
  const text = document.getElementById('btn-toggle-stream-text');

  if (!btn || !icon || !text) return;

  if (isStreaming) {
    btn.className = 'inodino-btn inodino-btn-danger';
    icon.innerText = '⏹';
    text.innerText = 'Dừng Camera OpenCV';
  } else {
    btn.className = 'inodino-btn inodino-btn-primary';
    icon.innerText = '▶';
    text.innerText = 'Bật Camera OpenCV (Web Stream)';
  }
}

// ==========================================
// 2. KHỞI ĐỘNG & DỪNG LUỒNG OPENCV TỪ WEB
// ==========================================
window.startOpencvLiveStream = async function() {
  const scheduleId = dashboardState.activeScheduleId;
  const examScheduleId = dashboardState.activeExamScheduleId;

  if (!scheduleId && !examScheduleId) {
    showToast('Vui lòng chọn Ca học hoặc Ca thi trước khi bật camera', 'warning');
    return;
  }

  showToast('Đang kết nối Camera OpenCV và tải AI Model InsightFace...', 'info');

  try {
    let url = `${API_BASE}/camera/start`;
    if (scheduleId) url += `?scheduleId=${scheduleId}`;
    else if (examScheduleId) url += `?examScheduleId=${examScheduleId}`;

    const res = await fetch(url, { method: 'POST' }).then(r => r.json());
    if (res.success) {
      showToast('🚀 Đã kích hoạt Camera OpenCV Live Stream thành công!', 'success');
      dashboardState.isCameraStreaming = true;
      updateStreamButtonState(true);
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (err) {
    console.error('Error starting camera stream:', err);
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  }
};

window.stopOpencvLiveStream = async function() {
  try {
    const res = await fetch(`${API_BASE}/camera/stop`, { method: 'POST' }).then(r => r.json());
    dashboardState.isCameraStreaming = false;
    updateStreamButtonState(false);
    
    const imgEl = document.getElementById('opencv-stream-view');
    const placeholder = document.getElementById('opencv-stream-placeholder');
    if (imgEl) imgEl.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';

    showToast('Đã dừng Camera và giải phóng thiết bị', 'info');
  } catch (err) {
    console.error('Error stopping camera stream:', err);
  }
};

window.toggleOpencvLiveStream = function() {
  if (dashboardState.isCameraStreaming) {
    window.stopOpencvLiveStream();
  } else {
    window.startOpencvLiveStream();
  }
};

// ==========================================
// 3. TẢI DANH SÁCH LỚP HỌC & CA THI
// ==========================================
async function loadDashboardCards() {
  try {
    const [resClass, resExam] = await Promise.all([
      fetch(`${API_BASE}/schedules/class`).then(r => r.json()),
      fetch(`${API_BASE}/schedules/exam`).then(r => r.json())
    ]);

    if (resClass.success && resClass.data) {
      dashboardState.classSchedules = resClass.data;
      const countEl = document.getElementById('class-count-badge');
      if (countEl) countEl.innerText = resClass.data.length;
    }

    if (resExam.success && resExam.data) {
      dashboardState.examSchedules = resExam.data;
      const countEl = document.getElementById('exam-count-badge');
      if (countEl) countEl.innerText = resExam.data.length;
    }

    renderCurrentView();
  } catch (err) {
    console.error('Error loading dashboard cards:', err);
    showToast('Lỗi tải danh sách lớp học và ca thi', 'error');
  }
}

function renderCurrentView() {
  const container = document.getElementById('schedule-grid-container');
  if (!container) return;

  if (dashboardState.currentCategory === 'class') {
    renderClassGrid(container, dashboardState.classSchedules);
  } else {
    renderExamGrid(container, dashboardState.examSchedules);
  }
}

function renderClassGrid(container, list) {
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center" style="padding: 40px; grid-column: 1 / -1;">
        <div style="font-size: 2.5rem; margin-bottom: 10px;">🏫</div>
        <h5 style="color: #64748b;">Chưa có lịch học nào trong hệ thống</h5>
        <p style="font-size: 0.85rem; color: #94a3b8;">Vào Trang Quản Trị -> Quản lý Lịch Học để thêm mới.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(item => {
    const courseName = item.course ? item.course.courseName : (item.courseName || 'Môn học');
    const courseCode = item.course ? item.course.courseCode : '';
    const room = item.room || 'Phòng học';
    const day = item.dayOfWeek || 'Thứ 2';
    const timeSlot = `${item.startTime || '07:30'} - ${item.endTime || '11:30'}`;
    const dateStr = item.attendanceDate ? item.attendanceDate : 'Hôm nay';

    return `
      <div class="schedule-card schedule-card-class">
        <div class="schedule-card-header">
          <div>
            <span class="schedule-badge schedule-badge-class">🏫 Lớp Học</span>
            <h4 class="schedule-course-title" title="${courseName}">${courseName}</h4>
            <span class="schedule-course-code">${courseCode}</span>
          </div>
          <div class="schedule-room-pill">📍 ${room}</div>
        </div>

        <div class="schedule-card-body">
          <div class="schedule-info-row">
            <span>📅 Ngày & Thứ:</span>
            <strong>${day} (${dateStr})</strong>
          </div>
          <div class="schedule-info-row">
            <span>⏰ Khung giờ:</span>
            <strong>${timeSlot}</strong>
          </div>
        </div>

        <div class="schedule-card-footer">
          <button class="inodino-btn inodino-btn-primary inodino-btn-sm" style="flex: 1;" onclick="openClassAttendanceFocus(${item.id}, '${escapeHtml(courseName)}', '${escapeHtml(room)}')">
            <span>📸 BẬT ĐIỂM DANH</span>
          </button>
          <button class="inodino-btn inodino-btn-dark inodino-btn-sm" title="Mở Camera Desktop Python" onclick="launchDirectDesktopScan(${item.id})">
            <span>🎥 Desktop</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderExamGrid(container, list) {
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center" style="padding: 40px; grid-column: 1 / -1;">
        <div style="font-size: 2.5rem; margin-bottom: 10px;">🎓</div>
        <h5 style="color: #64748b;">Chưa có ca thi nào được tạo</h5>
        <p style="font-size: 0.85rem; color: #94a3b8;">Vào Trang Quản Trị -> Quản lý Phòng Thi để lập danh sách ca thi.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(item => {
    const courseName = item.course ? item.course.courseName : (item.courseName || 'Môn thi');
    const courseCode = item.course ? item.course.courseCode : '';
    const room = item.room || 'Phòng thi';
    const examDate = item.examDate ? item.examDate : 'Hôm nay';
    const timeSlot = `${item.startTime || '07:30'} - ${item.endTime || '09:30'}`;
    const maxSeats = item.roomCapacity || (item.roomRows && item.roomCols ? item.roomRows * item.roomCols : 30);

    return `
      <div class="schedule-card schedule-card-exam">
        <div class="schedule-card-header">
          <div>
            <span class="schedule-badge schedule-badge-exam">🎓 Phòng Thi</span>
            <h4 class="schedule-course-title" title="${courseName}">${courseName}</h4>
            <span class="schedule-course-code">${courseCode}</span>
          </div>
          <div class="schedule-room-pill" style="background:#fef3c7; color:#b45309;">📍 ${room}</div>
        </div>

        <div class="schedule-card-body">
          <div class="schedule-info-row">
            <span>📅 Ngày thi:</span>
            <strong>${examDate}</strong>
          </div>
          <div class="schedule-info-row">
            <span>⏰ Ca thi:</span>
            <strong>${timeSlot}</strong>
          </div>
          <div class="schedule-info-row">
            <span>🪑 Sơ đồ ghế:</span>
            <strong>${item.roomRows || 5} hàng x ${item.roomCols || 6} cột (${maxSeats} chỗ)</strong>
          </div>
        </div>

        <div class="schedule-card-footer">
          <button class="inodino-btn inodino-btn-primary inodino-btn-sm" style="flex: 1; background: #0284c7; border-color: #0284c7;" onclick="openExamAttendanceFocus(${item.id}, '${escapeHtml(courseName)}', '${escapeHtml(room)}')">
            <span>🛡️ XÁC THỰC PHÒNG THI</span>
          </button>
          <button class="inodino-btn inodino-btn-dark inodino-btn-sm" title="Mở Camera Desktop Python" onclick="launchDirectDesktopScan(${item.id})">
            <span>🎥 Desktop</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 4. MỞ & ĐÓNG MODAL ĐIỂM DANH TẬP TRUNG
// ==========================================
window.openClassAttendanceFocus = function(scheduleId, courseName, room) {
  dashboardState.activeScheduleId = scheduleId;
  dashboardState.activeExamScheduleId = null;
  dashboardState.activeScheduleName = courseName;

  document.getElementById('focus-modal-title').innerHTML = `<span>📸</span> Điểm Danh: <strong>${courseName}</strong> (${room})`;
  document.getElementById('focus-modal-room-badge').innerText = room;
  document.getElementById('focus-modal-exam-tab-btn').style.display = 'none';

  const modal = document.getElementById('attendance-focus-modal');
  if (modal) modal.classList.add('active');

  // Khởi tạo STOMP kết nối WebSocket
  initStompClient();

  // Tải danh sách đã điểm danh
  loadFocusClassAttendance(scheduleId);

  // Tự động bật Camera OpenCV Web Stream
  window.startOpencvLiveStream();
};

window.openExamAttendanceFocus = function(examScheduleId, courseName, room) {
  dashboardState.activeExamScheduleId = examScheduleId;
  dashboardState.activeScheduleId = null;
  dashboardState.activeScheduleName = courseName;

  document.getElementById('focus-modal-title').innerHTML = `<span>🎓</span> Xác Thực Phòng Thi: <strong>${courseName}</strong> (${room})`;
  document.getElementById('focus-modal-room-badge').innerText = room;
  document.getElementById('focus-modal-exam-tab-btn').style.display = 'block';

  const modal = document.getElementById('attendance-focus-modal');
  if (modal) modal.classList.add('active');

  // Khởi tạo STOMP kết nối WebSocket
  initStompClient();

  // Tải dữ liệu thi
  loadFocusExamAttendance(examScheduleId);

  // Tự động bật Camera OpenCV Web Stream
  window.startOpencvLiveStream();
};

window.closeAttendanceFocusModal = function() {
  const modal = document.getElementById('attendance-focus-modal');
  if (modal) modal.classList.remove('active');

  // Dừng Camera và giải phóng thiết bị
  window.stopOpencvLiveStream();

  dashboardState.activeScheduleId = null;
  dashboardState.activeExamScheduleId = null;
};

// ==========================================
// 5. TẢI DỮ LIỆU ĐIỂM DANH & SƠ ĐỒ GHỄ
// ==========================================
async function loadFocusClassAttendance(scheduleId, isRealtimeUpdate = false) {
  const tbody = document.getElementById('focus-attendance-tbody');
  const countBadge = document.getElementById('focus-attendee-count');
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/attendance/class/${scheduleId}`).then(r => r.json());
    if (res.success && res.data) {
      dashboardState.attendeesList = res.data;
      if (countBadge) countBadge.innerText = res.data.length;

      if (res.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding: 18px;">Chưa có sinh viên nào điểm danh ca học này</td></tr>`;
        return;
      }

      tbody.innerHTML = res.data.map((att, idx) => {
        const isLatest = idx === 0 && isRealtimeUpdate;
        const student = att.student || {};
        const checkInTime = att.checkInTime ? formatDateTime(att.checkInTime) : 'N/A';
        const confidence = att.confidenceScore ? `${(att.confidenceScore * 100).toFixed(0)}%` : '98%';

        return `
          <tr class="${isLatest ? 'row-new-attendee' : ''}">
            <td><strong>#${idx + 1}</strong></td>
            <td><code>${student.studentCode || 'N/A'}</code></td>
            <td><strong>${student.fullName || 'Sinh viên'}</strong></td>
            <td style="font-size: 0.8rem; color: #64748b;">${checkInTime}</td>
            <td><span class="badge-tag" style="background:#dcfce7; color:#15803d; font-weight:700;">✅ CÓ MẶT (${confidence})</span></td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading focus class attendance:', err);
  }
}

async function loadFocusExamAttendance(examScheduleId, isRealtimeUpdate = false) {
  const tbody = document.getElementById('focus-attendance-tbody');
  const countBadge = document.getElementById('focus-attendee-count');
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/attendance/exam/${examScheduleId}`).then(r => r.json());
    if (res.success && res.data) {
      dashboardState.attendeesList = res.data;
      if (countBadge) countBadge.innerText = res.data.length;

      if (res.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding: 18px;">Chưa có thí sinh nào xác thực vào phòng thi</td></tr>`;
        return;
      }

      tbody.innerHTML = res.data.map((att, idx) => {
        const isLatest = idx === 0 && isRealtimeUpdate;
        const student = att.student || {};
        const checkInTime = att.checkInTime ? formatDateTime(att.checkInTime) : 'N/A';
        const seatInfo = (att.seatRow !== undefined && att.seatCol !== undefined) ? `Ghế ${att.seatRow + 1}-${att.seatCol + 1}` : 'Tự do';

        return `
          <tr class="${isLatest ? 'row-new-attendee' : ''}">
            <td><strong>#${idx + 1}</strong></td>
            <td><code>${student.studentCode || 'N/A'}</code></td>
            <td><strong>${student.fullName || 'Thí sinh'}</strong></td>
            <td style="font-size: 0.8rem; color: #64748b;">${checkInTime}</td>
            <td><span class="badge-tag" style="background:#e0f2fe; color:#0369a1; font-weight:700;">🎓 HỢP LỆ (${seatInfo})</span></td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading focus exam attendance:', err);
  }
}

// Chụp ảnh WebRTC thủ công (Fallback nếu không dùng OpenCV)
window.triggerCaptureAndCheckIn = async function() {
  showToast('Chức năng chụp ảnh đang chuẩn bị gửi lên AI Service...', 'info');
};

// 1-Click mở Camera Python Desktop nếu cần debug
window.launchDirectDesktopScan = async function(scheduleId) {
  showToast('Đang kích hoạt Camera Python (OpenCV) trên màn hình Desktop...', 'info');
  try {
    const res = await fetch(`${API_BASE}/attendance/launch-desktop-scan?scheduleId=${scheduleId}`, { method: 'POST' }).then(r => r.json());
    if (res.success) {
      showToast('🚀 Cửa sổ Camera OpenCV Desktop đã mở!', 'success');
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (e) {
    showToast('Lỗi kết nối: ' + e.message, 'error');
  }
};

window.launchCurrentFocusDesktop = function() {
  const targetId = dashboardState.activeScheduleId || dashboardState.activeExamScheduleId;
  if (targetId) {
    window.launchDirectDesktopScan(targetId);
  }
};

function escapeHtml(text) {
  return String(text).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatDateTime(dtStr) {
  try {
    const d = new Date(dtStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch (e) {
    return dtStr;
  }
}

// --- SETUP CATEGORY TOGGLES & BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', () => {
  loadDashboardCards();
  initStompClient();

  const classTabBtn = document.getElementById('tab-btn-classes');
  const examTabBtn = document.getElementById('tab-btn-exams');

  if (classTabBtn) {
    classTabBtn.addEventListener('click', () => {
      dashboardState.currentCategory = 'class';
      classTabBtn.classList.add('active');
      if (examTabBtn) examTabBtn.classList.remove('active');
      renderCurrentView();
    });
  }

  if (examTabBtn) {
    examTabBtn.addEventListener('click', () => {
      dashboardState.currentCategory = 'exam';
      examTabBtn.classList.add('active');
      if (classTabBtn) classTabBtn.classList.remove('active');
      renderCurrentView();
    });
  }
});
