/**
 * EXAM VERIFICATION MODULE
 * Xử lý nghiệp vụ Xác thực phòng thi, kiểm tra điều kiện dự thi và hiển thị sơ đồ ghế ngồi trực quan
 * Tích hợp truyền luồng Camera OpenCV trực tiếp qua WebSocket (STOMP Topic /topic/camera-stream)
 */

const examVerificationState = {
  selectedExamScheduleId: null,
  examSchedules: [],
  stompClient: null,
  isCameraStreaming: false,
  latestCheckedInSeat: null
};

// --- ÂM THANH THÔNG BÁO WEB AUDIO API ---
function playExamSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc.frequency.setValueAtTime(987.77, ctx.currentTime + 0.08); // B5
    osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.16); // E6
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {}
}

// ==========================================
// 1. WEBSOCKET & STOMP CLIENT MANAGEMENT
// ==========================================
function initExamStompClient() {
  if (examVerificationState.stompClient && examVerificationState.stompClient.connected) {
    return;
  }

  const badgeEl = document.getElementById('exam-stomp-status-badge');
  const badgeText = document.getElementById('exam-stomp-status-text');

  if (badgeEl && badgeText) {
    badgeEl.className = 'stomp-live-badge connecting';
    badgeText.innerText = 'STOMP: ĐANG KẾT NỐI...';
  }

  const socket = new SockJS(`${API_BASE.replace('/api', '')}/ws-attendance`);
  const stomp = Stomp.over(socket);
  stomp.debug = null;

  stomp.connect({}, (frame) => {
    console.log('[STOMP Exam] Đã kết nối WebSocket Message Broker:', frame);
    examVerificationState.stompClient = stomp;

    if (badgeEl && badgeText) {
      badgeEl.className = 'stomp-live-badge';
      badgeText.innerText = '🟢 STOMP: TRỰC TIẾP';
    }

    // 1. Lắng nghe luồng camera OpenCV (/topic/camera-stream)
    stomp.subscribe('/topic/camera-stream', (message) => {
      try {
        const streamData = JSON.parse(message.body);
        renderExamStreamFrame(streamData);
      } catch (err) {
        console.error('Error parsing exam camera stream frame:', err);
      }
    });

    // 2. Lắng nghe sự kiện Điểm danh/Xác thực (/topic/attendance-events)
    stomp.subscribe('/topic/attendance-events', (message) => {
      try {
        const eventData = JSON.parse(message.body);
        handleExamAttendanceEvent(eventData);
      } catch (err) {
        console.error('Error handling exam attendance event:', err);
      }
    });

    // 3. Lắng nghe trạng thái Camera (/topic/camera-status)
    stomp.subscribe('/topic/camera-status', (message) => {
      try {
        const statusData = JSON.parse(message.body);
        handleExamCameraStatus(statusData);
      } catch (err) {
        console.error('Error parsing camera status:', err);
      }
    });

  }, (error) => {
    console.warn('[STOMP Exam] Lỗi kết nối WebSocket:', error);
    examVerificationState.stompClient = null;
    if (badgeEl && badgeText) {
      badgeEl.className = 'stomp-live-badge disconnected';
      badgeText.innerText = 'STOMP: MẤT KẾT NỐI';
    }
  });
}

function renderExamStreamFrame(streamData) {
  const imgEl = document.getElementById('exam-opencv-stream-view');
  const placeholderEl = document.getElementById('exam-opencv-placeholder');
  const fpsEl = document.getElementById('exam-stream-fps-text');
  const facesEl = document.getElementById('exam-stream-faces-text');

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

    examVerificationState.isCameraStreaming = true;
    updateExamButtonState(true);
  }
}

function handleExamAttendanceEvent(event) {
  if (examVerificationState.selectedExamScheduleId && 
      String(event.examScheduleId) === String(examVerificationState.selectedExamScheduleId)) {
    
    playExamSuccessChime();
    showToast(`🎓 Đã xác thực thí sinh: ${event.fullName} (${event.studentCode})`, 'success');

    const nameBox = document.getElementById('exam-result-name-box');
    const descBox = document.getElementById('exam-result-desc');
    if (nameBox) {
      nameBox.innerHTML = `<span>✅</span> <span style="color: #38bdf8; font-weight: 700;">${event.fullName} (${event.studentCode})</span>`;
    }
    if (descBox) {
      descBox.innerHTML = `Độ tin cậy: <strong>${Math.round((event.confidence || 0.95) * 100)}%</strong> - Tư cách: <strong style="color:#34d399;">HỢP LỆ VÀO PHÒNG THI</strong>`;
    }

    loadExamAttendanceData(examVerificationState.selectedExamScheduleId);
  }
}

function handleExamCameraStatus(statusData) {
  if (statusData.status === 'STARTED') {
    examVerificationState.isCameraStreaming = true;
    updateExamButtonState(true);
    const placeholder = document.getElementById('exam-opencv-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  } else if (statusData.status === 'STOPPED') {
    examVerificationState.isCameraStreaming = false;
    updateExamButtonState(false);
    const imgEl = document.getElementById('exam-opencv-stream-view');
    const placeholder = document.getElementById('exam-opencv-placeholder');
    if (imgEl) imgEl.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
  }
}

function updateExamButtonState(isStreaming) {
  const btn = document.getElementById('btn-toggle-exam-stream');
  const icon = document.getElementById('btn-toggle-exam-icon');
  const text = document.getElementById('btn-toggle-exam-text');

  if (!btn || !icon || !text) return;

  if (isStreaming) {
    btn.className = 'inodino-btn inodino-btn-danger';
    icon.innerText = '⏹';
    text.innerText = 'Dừng Camera Xác Thực';
  } else {
    btn.className = 'inodino-btn inodino-btn-primary';
    icon.innerText = '▶';
    text.innerText = 'Bật Camera Xác Thực (Web Stream)';
  }
}

// ==========================================
// 2. KHỞI ĐỘNG & DỪNG CAMERA TỪ TRANG EXAM
// ==========================================
window.startExamOpencvStream = async function() {
  const examScheduleId = examVerificationState.selectedExamScheduleId;
  if (!examScheduleId) {
    showToast('Vui lòng chọn Ca thi / Phòng thi trước khi bật camera', 'warning');
    return;
  }

  showToast('Đang kết nối Camera OpenCV và nạp danh sách thí sinh ca thi...', 'info');

  try {
    const res = await fetch(`${API_BASE}/camera/start?examScheduleId=${examScheduleId}`, { method: 'POST' }).then(r => r.json());
    if (res.success) {
      showToast('🚀 Đã kích hoạt Camera Xác thực phòng thi thành công!', 'success');
      examVerificationState.isCameraStreaming = true;
      updateExamButtonState(true);
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (err) {
    console.error('Error starting exam stream:', err);
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  }
};

window.stopExamOpencvStream = async function() {
  try {
    await fetch(`${API_BASE}/camera/stop`, { method: 'POST' }).then(r => r.json());
    examVerificationState.isCameraStreaming = false;
    updateExamButtonState(false);
    
    const imgEl = document.getElementById('exam-opencv-stream-view');
    const placeholder = document.getElementById('exam-opencv-placeholder');
    if (imgEl) imgEl.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';

    showToast('Đã dừng Camera và giải phóng thiết bị', 'info');
  } catch (err) {
    console.error('Error stopping exam stream:', err);
  }
};

window.toggleExamOpencvStream = function() {
  if (examVerificationState.isCameraStreaming) {
    window.stopExamOpencvStream();
  } else {
    window.startExamOpencvStream();
  }
};

// ==========================================
// 3. TẢI DỮ LIỆU CA THI VÀ SƠ ĐỒ GHẾ
// ==========================================
async function loadExamSchedules() {
  try {
    const res = await fetch(`${API_BASE}/schedules/exam`).then(r => r.json());
    if (res.success && res.data) {
      examVerificationState.examSchedules = res.data;
      const select = document.getElementById('exam-schedule-select');
      if (select) {
        select.innerHTML = `
          <option value="">-- Vui lòng chọn Ca thi / Phòng thi --</option>
          ${res.data.map(e => `
            <option value="${e.id}">
              ${e.course?.courseName || 'Môn thi'} | ${e.room || e.examRoom || 'Phòng thi'} (${e.examDate || 'Hôm nay'})
            </option>
          `).join('')}
        `;
      }
    }
  } catch (err) {
    console.error('Error loading exam schedules:', err);
    showToast('Lỗi tải danh sách ca thi', 'error');
  }
}

async function loadExamAttendanceData(examScheduleId) {
  if (!examScheduleId) return;
  try {
    const res = await fetch(`${API_BASE}/attendance/exam/${examScheduleId}`).then(r => r.json());
    const countEl = document.getElementById('exam-verified-count');
    const tbody = document.getElementById('exam-attendance-tbody');

    if (res.success && res.data) {
      if (countEl) countEl.innerText = res.data.length;

      if (tbody) {
        if (res.data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Chưa có thí sinh nào vào phòng thi</td></tr>`;
        } else {
          tbody.innerHTML = res.data.map((item, idx) => {
            const student = item.student || {};
            const seatInfo = (item.seatRow !== undefined && item.seatCol !== undefined) 
              ? `Ghế ${item.seatRow + 1}-${item.seatCol + 1}` 
              : 'Tự do';
            const sbd = `SBD-${String(idx + 1).padStart(2, '0')}`;

            return `
              <tr>
                <td><strong style="color: var(--primary); font-weight: 700;">${sbd}</strong></td>
                <td><code>${student.studentCode || 'N/A'}</code></td>
                <td><strong>${student.fullName || 'Thí sinh'}</strong></td>
                <td>${student.className || '-'}</td>
                <td style="font-size: 0.8rem; color: #64748b;">${formatDateTime(item.checkInTime)}</td>
                <td><span class="badge-tag" style="background:#e0f2fe; color:#0369a1; font-weight:700;">✅ HỢP LỆ (${seatInfo})</span></td>
              </tr>
            `;
          }).join('');
        }
      }

      renderExamLiveSeatingChart(examScheduleId, res.data);
    }
  } catch (err) {
    console.error('Error loading exam attendance:', err);
  }
}

function renderExamLiveSeatingChart(examScheduleId, attendees) {
  const container = document.getElementById('exam-seating-chart-container');
  if (!container) return;

  const examSchedule = examVerificationState.examSchedules.find(e => e.id == examScheduleId);
  const rows = examSchedule?.roomRows || 5;
  const cols = examSchedule?.roomCols || 6;

  container.innerHTML = '';
  const gridEl = document.createElement('div');
  gridEl.className = 'live-seating-grid';
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 60px)`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const seatBox = document.createElement('div');
      const attendee = attendees.find(a => a.seatRow === r && a.seatCol === c);

      if (attendee) {
        seatBox.className = 'live-seat-box occupied';
        const fullName = attendee.student?.fullName || 'Sinh viên';
        const nameParts = fullName.split(' ');
        const shortName = nameParts[nameParts.length - 1];

        seatBox.innerHTML = `
          <span class="seat-name">${shortName}</span>
          <span class="seat-code">${attendee.student?.studentCode}</span>
        `;
      } else {
        seatBox.className = 'live-seat-box empty';
        seatBox.innerHTML = `<span style="font-size: 0.6rem; color: #94a3b8; margin-top: auto;">${r+1}-${c+1}</span>`;
      }
      gridEl.appendChild(seatBox);
    }
  }

  container.appendChild(gridEl);
}

// 1-Click mở OpenCV Desktop nếu muốn chạy chế độ cũ
window.launchExamDesktopOpenCV = async function() {
  if (!examVerificationState.selectedExamScheduleId) {
    showToast('Vui lòng chọn Ca thi / Phòng thi trước khi bật Camera Desktop', 'warning');
    return;
  }

  showToast('Đang kích hoạt Camera Python (OpenCV) trên màn hình Desktop...', 'info');
  try {
    const response = await fetch(`${API_BASE}/attendance/launch-desktop-scan?scheduleId=${examVerificationState.selectedExamScheduleId}`, {
      method: 'POST'
    });
    const result = await response.json();
    if (result.success) {
      showToast('🚀 Khởi chạy OpenCV Desktop xác thực thi thành công!', 'success');
    } else {
      showToast('Lỗi: ' + result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối: ' + err.message, 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadExamSchedules();
  initExamStompClient();

  const select = document.getElementById('exam-schedule-select');
  if (select) {
    select.addEventListener('change', (e) => {
      const val = e.target.value;
      examVerificationState.selectedExamScheduleId = val || null;
      if (val) {
        loadExamAttendanceData(val);
      } else {
        const tbody = document.getElementById('exam-attendance-tbody');
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Chưa có thí sinh nào vào phòng thi</td></tr>`;
        }
        const chart = document.getElementById('exam-seating-chart-container');
        if (chart) {
          chart.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin: 0;">Vui lòng chọn ca thi để xem sơ đồ phòng</p>`;
        }
      }
    });
  }
});
