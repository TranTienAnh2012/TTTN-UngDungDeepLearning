/**
 * ADMIN PORTAL MODULE
 * Quản trị Sinh viên, Môn học, Ca học, Ca thi, Cấm thi và Đăng ký Face ID
 */

const adminState = {
  activeSubTab: 'admin-students',
  students: [],
  courses: [],
  classSchedules: [],
  examSchedules: [],
  adminSelectedExamId: null,
  adminSeatingExamId: null,
  adminDisabledSeats: [],
  regTargetCode: null,
  regFullName: null,
  regClassName: null,
  regStream: null,
  regDetectionInterval: null
};

// --- Check Login Security on Load ---
function ensureAdminLoggedIn() {
  const adminUser = localStorage.getItem('adminUser');
  if (!adminUser) {
    showToast('Vui lòng đăng nhập để truy cập trang quản trị', 'warning');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 500);
    return false;
  }
  return true;
}

// --- Subtab Navigation ---
function setupAdminSubnav() {
  document.querySelectorAll('.admin-subnav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subtabName = btn.dataset.subtab;
      document.querySelectorAll('.admin-subnav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-sub-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetSubPane = document.getElementById(`subtab-${subtabName}`);
      if (targetSubPane) targetSubPane.classList.add('active');
      adminState.activeSubTab = subtabName;

      if (subtabName === 'admin-students') loadStudents();
      else if (subtabName === 'admin-courses') loadCourses();
      else if (subtabName === 'admin-class-schedules') loadAdminClassSchedules();
      else if (subtabName === 'admin-exam-schedules') loadAdminExamSchedules();
      else if (subtabName === 'admin-eligibility') loadAdminEligibility();
    });
  });
}

// ==========================================
// 1. QUẢN LÝ SINH VIÊN
// ==========================================
async function loadStudents() {
  try {
    const res = await fetch(`${API_BASE}/students`).then(r => r.json());
    if (res.success && res.data) {
      adminState.students = res.data;
      renderAdminStudents(adminState.students);
    }
  } catch (err) {
    showToast('Lỗi tải danh sách sinh viên', 'error');
  }
}

function renderAdminStudents(list) {
  const tbody = document.getElementById('admin-students-tbody');
  if (!tbody) return;

  tbody.innerHTML = list.length === 0
    ? `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Không có sinh viên nào</td></tr>`
    : list.map((st, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${st.studentCode}</strong></td>
          <td>${st.fullName}</td>
          <td>${st.dateOfBirth || '-'}</td>
          <td>${st.className || '-'}</td>
          <td>
            <span class="badge-tag ${st.hasFaceRegistered ? 'registered' : 'unregistered'}">
              ${st.hasFaceRegistered ? '✓ Đã có Face ID' : 'Chưa có Face ID'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <button class="inodino-btn inodino-btn-primary inodino-btn-sm" onclick="openFaceRegistrationModal('${st.studentCode}', '${st.fullName}', '${st.className || ''}', ${st.hasFaceRegistered})">
                📸 Face ID
              </button>
              <button class="inodino-btn inodino-btn-dark inodino-btn-sm" title="Mở trực tiếp cửa sổ OpenCV" onclick="launchOpenCvRegister('${st.studentCode}', '${st.fullName}', '${st.className || ''}')">
                ⚡ OpenCV
              </button>
              <button class="inodino-btn inodino-btn-dark inodino-btn-sm" onclick="openEditStudentModal(${st.id}, '${st.studentCode}', '${st.fullName}', '${st.dateOfBirth}', '${st.className}')">
                ✏️ Sửa
              </button>
              <button class="inodino-btn inodino-btn-danger inodino-btn-sm" onclick="deleteStudent(${st.id})">
                🗑️ Xóa
              </button>
            </div>
          </td>
        </tr>
      `).join('');
}

window.openCreateStudentModal = function() {
  document.getElementById('student-modal-title').innerHTML = '<span>👤</span> Thêm Sinh Viên Mới';
  document.getElementById('student-form-id').value = '';
  document.getElementById('student-form-code').value = '';
  document.getElementById('student-form-code').disabled = false;
  document.getElementById('student-form-name').value = '';
  document.getElementById('student-form-dob').value = '2005-01-01';
  document.getElementById('student-form-class').value = 'K23CNT3';
  document.getElementById('student-modal').classList.add('active');
};

window.openEditStudentModal = function(id, code, name, dob, className) {
  document.getElementById('student-modal-title').innerHTML = '<span>👤</span> Chỉnh Sửa Sinh Viên';
  document.getElementById('student-form-id').value = id;
  document.getElementById('student-form-code').value = code;
  document.getElementById('student-form-code').disabled = true;
  document.getElementById('student-form-name').value = name;
  document.getElementById('student-form-dob').value = dob || '';
  document.getElementById('student-form-class').value = className || '';
  document.getElementById('student-modal').classList.add('active');
};

window.closeStudentModal = function() {
  document.getElementById('student-modal').classList.remove('active');
};

window.deleteStudent = async function(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa sinh viên này khỏi hệ thống?')) return;
  try {
    const res = await fetch(`${API_BASE}/students/${id}`, { method: 'DELETE' }).then(r => r.json());
    if (res.success) {
      showToast('Đã xóa sinh viên thành công', 'success');
      loadStudents();
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
};

// ==========================================
// 2. MODAL ĐĂNG KÝ FACE ID & XỬ LÝ CAMERA OPENCV TRỰC TIẾP QUA WEBSOCKET STOMP
// ==========================================
let adminStompClient = null;
let isRegStreaming = false;

function playAdminSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {}
}

function initAdminStompClient() {
  if (adminStompClient && adminStompClient.connected) return;

  const badgeEl = document.getElementById('reg-stomp-status-badge');
  const badgeText = document.getElementById('reg-stomp-status-text');

  if (badgeEl && badgeText) {
    badgeEl.className = 'stomp-live-badge connecting';
    badgeText.innerText = 'STOMP: ĐANG KẾT NỐI...';
  }

  const socket = new SockJS(`${API_BASE.replace('/api', '')}/ws-attendance`);
  const stomp = Stomp.over(socket);
  stomp.debug = null;

  stomp.connect({}, (frame) => {
    console.log('[STOMP Admin] Đã kết nối WebSocket:', frame);
    adminStompClient = stomp;

    if (badgeEl && badgeText) {
      badgeEl.className = 'stomp-live-badge';
      badgeText.innerText = '🟢 STOMP: TRỰC TIẾP';
    }

    // Lắng nghe luồng hình ảnh camera
    stomp.subscribe('/topic/camera-stream', (message) => {
      try {
        const streamData = JSON.parse(message.body);
        renderRegStreamFrame(streamData);
      } catch (err) {}
    });

    // Lắng nghe sự kiện đăng ký khuôn mặt thành công
    stomp.subscribe('/topic/attendance-events', (message) => {
      try {
        const eventData = JSON.parse(message.body);
        if (eventData.eventType === 'FACE_REGISTERED' && String(eventData.studentCode) === String(adminState.regTargetCode)) {
          playAdminSuccessChime();
          showToast(`🎉 Đã lưu Face ID thành công cho ${eventData.fullName} (${eventData.studentCode})!`, 'success');
          
          const statusPill = document.getElementById('reg-face-status-pill');
          if (statusPill) {
            statusPill.className = 'badge-tag registered';
            statusPill.innerText = '✓ Đã có Face ID';
          }
          
          loadStudents();
        }
      } catch (err) {}
    });

    // Lắng nghe trạng thái Camera
    stomp.subscribe('/topic/camera-status', (message) => {
      try {
        const statusData = JSON.parse(message.body);
        if (statusData.status === 'STARTED') {
          isRegStreaming = true;
          updateRegButtonState(true);
        } else if (statusData.status === 'STOPPED') {
          isRegStreaming = false;
          updateRegButtonState(false);
          const imgEl = document.getElementById('reg-opencv-stream-view');
          const placeholder = document.getElementById('reg-opencv-placeholder');
          if (imgEl) imgEl.style.display = 'none';
          if (placeholder) placeholder.style.display = 'flex';
        }
      } catch (err) {}
    });

  }, (error) => {
    console.warn('[STOMP Admin] Lỗi kết nối WebSocket:', error);
    adminStompClient = null;
    if (badgeEl && badgeText) {
      badgeEl.className = 'stomp-live-badge disconnected';
      badgeText.innerText = 'STOMP: MẤT KẾT NỐI';
    }
  });
}

function renderRegStreamFrame(streamData) {
  const imgEl = document.getElementById('reg-opencv-stream-view');
  const placeholderEl = document.getElementById('reg-opencv-placeholder');
  const fpsEl = document.getElementById('reg-stream-fps-text');
  const facesEl = document.getElementById('reg-stream-faces-text');

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

    isRegStreaming = true;
    updateRegButtonState(true);
  }
}

function updateRegButtonState(isStreaming) {
  const btn = document.getElementById('btn-toggle-reg-stream');
  const icon = document.getElementById('btn-toggle-reg-icon');
  const text = document.getElementById('btn-toggle-reg-text');

  if (!btn || !icon || !text) return;

  if (isStreaming) {
    btn.className = 'inodino-btn inodino-btn-danger';
    icon.innerText = '⏹';
    text.innerText = 'Dừng Camera Đăng Ký';
  } else {
    btn.className = 'inodino-btn inodino-btn-primary';
    icon.innerText = '▶';
    text.innerText = 'Bật Camera Đăng Ký (Web Stream)';
  }
}

window.startRegisterOpencvStream = async function() {
  const sCode = adminState.regTargetCode;
  const sName = adminState.regFullName || 'Sinh viên';
  const sClass = adminState.regClassName || 'K23CNT3';

  if (!sCode) {
    showToast('Vui lòng chọn sinh viên cần đăng ký', 'warning');
    return;
  }

  showToast(`Đang khởi động Camera OpenCV kiểm tra chống giả mạo (Liveness) cho ${sName}...`, 'info');

  try {
    const params = new URLSearchParams({
      studentCode: sCode,
      fullName: sName,
      className: sClass
    });
    const res = await fetch(`${API_BASE}/camera/register/start?${params.toString()}`, { method: 'POST' }).then(r => r.json());
    if (res.success) {
      showToast('🚀 Đã bật Camera OpenCV Đăng Ký thành công!', 'success');
      isRegStreaming = true;
      updateRegButtonState(true);
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (err) {
    console.error('Error starting register stream:', err);
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  }
};

window.stopRegisterOpencvStream = async function() {
  try {
    await fetch(`${API_BASE}/camera/stop`, { method: 'POST' }).then(r => r.json());
    isRegStreaming = false;
    updateRegButtonState(false);
    
    const imgEl = document.getElementById('reg-opencv-stream-view');
    const placeholder = document.getElementById('reg-opencv-placeholder');
    if (imgEl) imgEl.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';

    showToast('Đã dừng Camera và giải phóng thiết bị', 'info');
  } catch (err) {
    console.error('Error stopping register stream:', err);
  }
};

window.toggleRegisterOpencvStream = function() {
  if (isRegStreaming) {
    window.stopRegisterOpencvStream();
  } else {
    window.startRegisterOpencvStream();
  }
};

window.launchOpenCvRegisterDesktop = async function() {
  const sCode = adminState.regTargetCode;
  const sName = adminState.regFullName || 'Sinh viên';
  const sClass = adminState.regClassName || 'Lớp';

  if (!sCode) {
    showToast('Không xác định được mã sinh viên để đăng ký', 'warning');
    return;
  }

  showToast(`🚀 Đang khởi chạy camera OpenCV Desktop cho ${sName} (${sCode})...`, 'info');
  try {
    const params = new URLSearchParams({
      studentCode: sCode,
      fullName: sName,
      className: sClass
    });
    const res = await fetch(`${API_BASE}/attendance/launch-register-scan?${params.toString()}`, {
      method: 'POST'
    }).then(r => r.json());

    if (res.success) {
      showToast(`Đã mở cửa sổ OpenCV cho [${sCode}] ${sName}. Hãy làm theo hướng dẫn 4 hướng đầu để lưu!`, 'success');
    } else {
      showToast('Lỗi mở OpenCV: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối Backend: ' + err.message, 'error');
  }
};

window.openFaceRegistrationModal = async function(studentCode, fullName, className = '', hasFaceRegistered = false) {
  adminState.regTargetCode = studentCode;

  const studentObj = adminState.students ? adminState.students.find(s => s.studentCode === studentCode) : null;
  const displayFullName = fullName || (studentObj ? studentObj.fullName : 'Sinh viên');
  const displayClass = className || (studentObj ? studentObj.className : 'Chưa cập nhật');
  const isRegistered = hasFaceRegistered || (studentObj ? studentObj.hasFaceRegistered : false);

  adminState.regFullName = displayFullName;
  adminState.regClassName = displayClass;

  const nameVal = document.getElementById('reg-student-name-val');
  const codeVal = document.getElementById('reg-student-code-val');
  const classVal = document.getElementById('reg-student-class-val');
  const statusPill = document.getElementById('reg-face-status-pill');

  if (nameVal) nameVal.innerText = displayFullName;
  if (codeVal) codeVal.innerText = `MSV: ${studentCode}`;
  if (classVal) classVal.innerText = `Lớp: ${displayClass}`;
  if (statusPill) {
    statusPill.className = `badge-tag ${isRegistered ? 'registered' : 'unregistered'}`;
    statusPill.innerText = isRegistered ? '✓ Đã có Face ID' : 'Chưa có Face ID';
  }

  const modal = document.getElementById('register-modal');
  if (modal) modal.classList.add('active');

  // Khởi tạo STOMP và bật camera trực tiếp
  initAdminStompClient();
  window.startRegisterOpencvStream();
};

window.closeRegModal = function() {
  const modal = document.getElementById('register-modal');
  if (modal) modal.classList.remove('active');

  // Dừng camera đăng ký ngay khi đóng modal
  window.stopRegisterOpencvStream();
};

// ==========================================
// 3. QUẢN LÝ MÔN HỌC (COURSES)
// ==========================================
async function loadCourses() {
  try {
    const res = await fetch(`${API_BASE}/schedules/courses`).then(r => r.json());
    const tbody = document.getElementById('admin-courses-tbody');
    if (res.success && res.data && tbody) {
      adminState.courses = res.data;
      tbody.innerHTML = res.data.length === 0
        ? `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Chưa có môn học nào</td></tr>`
        : res.data.map(c => `
            <tr>
              <td>${c.id}</td>
              <td><strong>${c.courseCode}</strong></td>
              <td>${c.courseName}</td>
              <td>
                <div style="display: flex; gap: 4px;">
                  <button class="inodino-btn inodino-btn-dark inodino-btn-sm" onclick="openEditCourseModal(${c.id}, '${c.courseCode}', '${c.courseName}')">
                    ✏️ Sửa
                  </button>
                  <button class="inodino-btn inodino-btn-danger inodino-btn-sm" onclick="deleteCourse(${c.id})">
                    🗑️ Xóa
                  </button>
                </div>
              </td>
            </tr>
          `).join('');
    }
  } catch (e) {
    showToast('Lỗi tải môn học', 'error');
  }
}

window.openCreateCourseModal = function() {
  document.getElementById('course-modal-title').innerHTML = '<span>📚</span> Thêm Môn Học Mới';
  document.getElementById('course-form-id').value = '';
  document.getElementById('course-form-code').value = '';
  document.getElementById('course-form-name').value = '';
  document.getElementById('course-modal').classList.add('active');
};

window.openEditCourseModal = function(id, code, name) {
  document.getElementById('course-modal-title').innerHTML = '<span>📚</span> Sửa Môn Học';
  document.getElementById('course-form-id').value = id;
  document.getElementById('course-form-code').value = code;
  document.getElementById('course-form-name').value = name;
  document.getElementById('course-modal').classList.add('active');
};

window.closeCourseModal = function() {
  document.getElementById('course-modal').classList.remove('active');
};

window.deleteCourse = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa môn học này?')) return;
  try {
    const res = await fetch(`${API_BASE}/schedules/courses/${id}`, { method: 'DELETE' }).then(r => r.json());
    if (res.success) {
      showToast('Đã xóa môn học', 'success');
      loadCourses();
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
};

// ==========================================
// 4. QUẢN LÝ LỊCH HỌC (CLASS SCHEDULES)
// ==========================================
async function loadAdminClassSchedules() {
  try {
    const res = await fetch(`${API_BASE}/schedules/class`).then(r => r.json());
    const tbody = document.getElementById('admin-class-schedules-tbody');
    if (res.success && res.data && tbody) {
      adminState.classSchedules = res.data;
      tbody.innerHTML = res.data.length === 0
        ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Chưa có ca học nào</td></tr>`
        : res.data.map(s => `
            <tr>
              <td>${s.id}</td>
              <td><strong>${s.course?.courseName || '-'}</strong></td>
              <td>${s.roomName}</td>
              <td>${formatDateTime(s.startTime)}</td>
              <td>${formatDateTime(s.endTime)}</td>
              <td>
                <div style="display: flex; gap: 4px;">
                  <button class="inodino-btn inodino-btn-dark inodino-btn-sm" onclick="openEditClassScheduleModal(${s.id}, ${s.course?.id || ''}, '${s.roomName}', '${s.startTime}', '${s.endTime}')">
                    ✏️ Sửa
                  </button>
                  <button class="inodino-btn inodino-btn-danger inodino-btn-sm" onclick="deleteClassSchedule(${s.id})">
                    🗑️ Xóa
                  </button>
                </div>
              </td>
            </tr>
          `).join('');
    }
  } catch (e) {
    showToast('Lỗi tải lịch học', 'error');
  }
}

window.openCreateClassScheduleModal = function() {
  document.getElementById('class-schedule-modal-title').innerHTML = '<span>🏫</span> Thêm Ca Học Mới';
  document.getElementById('class-schedule-form-id').value = '';
  document.getElementById('class-schedule-form-room').value = 'P.Lab 302';
  
  const courseSelect = document.getElementById('class-schedule-form-course');
  courseSelect.innerHTML = adminState.courses.map(c => `<option value="${c.id}">${c.courseName} (${c.courseCode})</option>`).join('');
  
  const now = new Date();
  const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  document.getElementById('class-schedule-form-start').value = toLocalISOString(now);
  document.getElementById('class-schedule-form-end').value = toLocalISOString(later);
  
  document.getElementById('class-schedule-modal').classList.add('active');
};

window.openEditClassScheduleModal = function(id, courseId, room, start, end) {
  document.getElementById('class-schedule-modal-title').innerHTML = '<span>🏫</span> Sửa Ca Học';
  document.getElementById('class-schedule-form-id').value = id;
  document.getElementById('class-schedule-form-room').value = room;
  
  const courseSelect = document.getElementById('class-schedule-form-course');
  courseSelect.innerHTML = adminState.courses.map(c => `<option value="${c.id}" ${c.id == courseId ? 'selected' : ''}>${c.courseName}</option>`).join('');
  
  document.getElementById('class-schedule-form-start').value = start ? start.substring(0, 16) : '';
  document.getElementById('class-schedule-form-end').value = end ? end.substring(0, 16) : '';
  
  document.getElementById('class-schedule-modal').classList.add('active');
};

window.closeClassScheduleModal = function() {
  document.getElementById('class-schedule-modal').classList.remove('active');
};

window.deleteClassSchedule = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa ca học này?')) return;
  try {
    const res = await fetch(`${API_BASE}/schedules/class/${id}`, { method: 'DELETE' }).then(r => r.json());
    if (res.success) {
      showToast('Đã xóa ca học', 'success');
      loadAdminClassSchedules();
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
};

// ==========================================
// 5. QUẢN LÝ CA THI (EXAM SCHEDULES)
// ==========================================
async function loadAdminExamSchedules() {
  try {
    const res = await fetch(`${API_BASE}/schedules/exam`).then(r => r.json());
    const tbody = document.getElementById('admin-exam-schedules-tbody');
    if (res.success && res.data && tbody) {
      adminState.examSchedules = res.data;
      tbody.innerHTML = res.data.length === 0
        ? `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Chưa có ca thi nào</td></tr>`
        : res.data.map(e => `
            <tr>
              <td>${e.id}</td>
              <td><strong>${e.course?.courseName || '-'}</strong></td>
              <td>${e.examRoom}</td>
              <td>${formatDateTime(e.examTime)}</td>
              <td>
                <div style="display: flex; gap: 4px;">
                  <button class="inodino-btn inodino-btn-success inodino-btn-sm" onclick="triggerExamStudentsImport(${e.id})">
                    📥 Nhập DS Thi
                  </button>
                  <button class="inodino-btn inodino-btn-primary inodino-btn-sm" onclick="openSeatingModalForExam(${e.id})">
                    🪑 Sơ đồ
                  </button>
                  <button class="inodino-btn inodino-btn-dark inodino-btn-sm" onclick="openEditExamScheduleModal(${e.id}, ${e.course?.id || ''}, '${e.examRoom}', '${e.examTime}')">
                    ✏️ Sửa
                  </button>
                  <button class="inodino-btn inodino-btn-danger inodino-btn-sm" onclick="deleteExamSchedule(${e.id})">
                    🗑️ Xóa
                  </button>
                </div>
              </td>
            </tr>
          `).join('');
    }
  } catch (e) {
    showToast('Lỗi tải ca thi', 'error');
  }
}

window.openCreateExamScheduleModal = function() {
  document.getElementById('exam-schedule-modal-title').innerHTML = '<span>📝</span> Thêm Ca Thi Mới';
  document.getElementById('exam-schedule-form-id').value = '';
  document.getElementById('exam-schedule-form-room').value = 'Phòng thi 401 - Tòa B';
  
  const courseSelect = document.getElementById('exam-schedule-form-course');
  courseSelect.innerHTML = adminState.courses.map(c => `<option value="${c.id}">${c.courseName} (${c.courseCode})</option>`).join('');
  
  const now = new Date(Date.now() + 24 * 60 * 60 * 1000);
  document.getElementById('exam-schedule-form-time').value = toLocalISOString(now);
  
  document.getElementById('exam-schedule-modal').classList.add('active');
};

window.openEditExamScheduleModal = function(id, courseId, room, time) {
  document.getElementById('exam-schedule-modal-title').innerHTML = '<span>📝</span> Sửa Ca Thi';
  document.getElementById('exam-schedule-form-id').value = id;
  document.getElementById('exam-schedule-form-room').value = room;
  
  const courseSelect = document.getElementById('exam-schedule-form-course');
  courseSelect.innerHTML = adminState.courses.map(c => `<option value="${c.id}" ${c.id == courseId ? 'selected' : ''}>${c.courseName}</option>`).join('');
  
  document.getElementById('exam-schedule-form-time').value = time ? time.substring(0, 16) : '';
  document.getElementById('exam-schedule-modal').classList.add('active');
};

window.closeExamScheduleModal = function() {
  document.getElementById('exam-schedule-modal').classList.remove('active');
};

window.deleteExamSchedule = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa ca thi này?')) return;
  try {
    const res = await fetch(`${API_BASE}/schedules/exam/${id}`, { method: 'DELETE' }).then(r => r.json());
    if (res.success) {
      showToast('Đã xóa ca thi', 'success');
      loadAdminExamSchedules();
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
};

// ==========================================
// 6. QUẢN LÝ ĐIỀU KIỆN THI (CẤM THI)
// ==========================================
async function loadAdminEligibility() {
  try {
    const resExams = await fetch(`${API_BASE}/schedules/exam`).then(r => r.json());
    const select = document.getElementById('admin-eligibility-exam-select');
    if (resExams.success && resExams.data && resExams.data.length > 0 && select) {
      adminState.examSchedules = resExams.data;
      select.innerHTML = resExams.data.map(e => `
        <option value="${e.id}">${e.course?.courseName || 'Môn thi'} | ${e.examRoom} (${formatDateTime(e.examTime)})</option>
      `).join('');
      
      adminState.adminSelectedExamId = adminState.adminSelectedExamId || resExams.data[0].id;
      select.value = adminState.adminSelectedExamId;
      fetchEligibilitiesForExam(adminState.adminSelectedExamId);
    }
  } catch (e) {
    showToast('Lỗi tải dữ liệu điều kiện thi', 'error');
  }
}

async function fetchEligibilitiesForExam(examScheduleId) {
  try {
    const res = await fetch(`${API_BASE}/schedules/exam/${examScheduleId}/eligibilities`).then(r => r.json());
    const tbody = document.getElementById('admin-eligibility-tbody');
    if (res.success && res.data && tbody) {
      tbody.innerHTML = res.data.length === 0
        ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Không có dữ liệu sinh viên cho ca thi này</td></tr>`
        : res.data.map((item, idx) => {
            const isEligible = Boolean(item.isEligible);
            return `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${item.student?.studentCode}</strong></td>
                <td>${item.student?.fullName}</td>
                <td>${item.student?.className || '-'}</td>
                <td>
                  <span class="badge-tag ${isEligible ? 'present' : 'denied'}">
                    ${isEligible ? '✓ Đủ điều kiện dự thi' : '⛔ BỊ CẤM THI'}
                  </span>
                </td>
                <td>
                  <button class="inodino-btn ${isEligible ? 'inodino-btn-danger' : 'inodino-btn-success'} inodino-btn-sm" onclick="toggleStudentEligibility(${examScheduleId}, ${item.student?.id}, ${!isEligible})">
                    ${isEligible ? '🚫 Đặt Cấm thi' : '✅ Cho phép dự thi'}
                  </button>
                </td>
              </tr>
            `;
          }).join('');
    }
  } catch (e) {
    console.error('Error fetching eligibility:', e);
  }
}

window.toggleStudentEligibility = async function(examScheduleId, studentId, targetState) {
  try {
    const res = await fetch(`${API_BASE}/schedules/exam/eligibility/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examScheduleId: examScheduleId, studentId: studentId, isEligible: targetState })
    }).then(r => r.json());

    if (res.success) {
      showToast('Đã cập nhật trạng thái điều kiện dự thi!', 'success');
      fetchEligibilitiesForExam(examScheduleId);
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (e) {
    showToast('Lỗi: ' + e.message, 'error');
  }
};

// ==========================================
// 7. SƠ ĐỒ PHÒNG THI MODAL & EXCEL IMPORTS
// ==========================================
window.openSeatingModalForExam = function(examId) {
  const e = adminState.examSchedules.find(x => x.id == examId);
  if (!e) return;
  
  adminState.adminSeatingExamId = examId;
  const rows = e.seatingRows || 5;
  const cols = e.seatingCols || 5;
  
  document.getElementById('seating-input-rows').value = rows;
  document.getElementById('seating-input-cols').value = cols;
  
  try {
    adminState.adminDisabledSeats = (e.disabledSeats && e.disabledSeats !== 'null') ? JSON.parse(e.disabledSeats) : [];
  } catch (err) {
    adminState.adminDisabledSeats = [];
  }
  
  renderSeatingSetupGrid(rows, cols);
  document.getElementById('seating-modal').classList.add('active');
};

window.closeSeatingModal = function() {
  document.getElementById('seating-modal').classList.remove('active');
};

window.regenerateSeatingGrid = function() {
  const rows = parseInt(document.getElementById('seating-input-rows').value) || 5;
  const cols = parseInt(document.getElementById('seating-input-cols').value) || 5;
  
  if (rows < 1 || rows > 10 || cols < 1 || cols > 10) {
    showToast('Kích thước phòng thi giới hạn từ 1x1 đến 10x10', 'warning');
    return;
  }
  
  adminState.adminDisabledSeats = adminState.adminDisabledSeats.filter(coord => {
    const [r, c] = coord.split('-').map(Number);
    return r < rows && c < cols;
  });
  
  renderSeatingSetupGrid(rows, cols);
};

function renderSeatingSetupGrid(rows, cols) {
  const container = document.getElementById('seating-grid-setup');
  if (!container) return;
  
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${cols}, 42px)`;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const coord = `${r}-${c}`;
      const seatBox = document.createElement('div');
      seatBox.className = 'seat-setup-box';
      seatBox.innerText = `${r+1}-${c+1}`;
      seatBox.title = `Hàng ${r+1}, Cột ${c+1}`;
      
      const isDisabled = adminState.adminDisabledSeats.includes(coord);
      if (isDisabled) {
        seatBox.classList.add('disabled-seat');
      }
      
      seatBox.addEventListener('click', () => {
        if (adminState.adminDisabledSeats.includes(coord)) {
          adminState.adminDisabledSeats = adminState.adminDisabledSeats.filter(x => x !== coord);
          seatBox.classList.remove('disabled-seat');
        } else {
          adminState.adminDisabledSeats.push(coord);
          seatBox.classList.add('disabled-seat');
        }
      });
      
      container.appendChild(seatBox);
    }
  }
}

window.saveSeatingLayout = async function() {
  if (!adminState.adminSeatingExamId) return;
  const rows = parseInt(document.getElementById('seating-input-rows').value) || 5;
  const cols = parseInt(document.getElementById('seating-input-cols').value) || 5;
  
  const payload = {
    seatingRows: rows,
    seatingCols: cols,
    disabledSeats: JSON.stringify(adminState.adminDisabledSeats)
  };
  
  try {
    const response = await fetch(`${API_BASE}/schedules/exam/${adminState.adminSeatingExamId}/seating`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    if (response.ok && result.success) {
      showToast('Đã cập nhật sơ đồ phòng thi thành công!', 'success');
      closeSeatingModal();
      loadAdminExamSchedules();
    } else {
      showToast('Lỗi: ' + result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  }
};

window.downloadExcelTemplate = function() {
  window.open(`${API_BASE}/students/excel/template`, '_blank');
  showToast('Đang tải tệp Excel mẫu...', 'info');
};

window.triggerExcelImport = function() {
  const fileInput = document.getElementById('excel-file-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
};

window.handleExcelImport = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const formData = new FormData();
  formData.append('file', file);
  showToast('Đang xử lý tệp Excel...', 'info');
  
  try {
    const response = await fetch(`${API_BASE}/students/excel/import`, {
      method: 'POST',
      body: formData
    });
    const result = await response.json();
    if (response.ok && result.success) {
      const data = result.data;
      showToast(`Nhập thành công ${data.importedCount} sinh viên.`, 'success');
      loadStudents();
    } else {
      showToast('Lỗi nhập Excel: ' + result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  }
};

let selectedExamIdForImport = null;
window.triggerExamStudentsImport = function(examId) {
  selectedExamIdForImport = examId;
  const fileInput = document.getElementById('exam-students-file-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
};

window.handleExamStudentsImport = async function(event) {
  const file = event.target.files[0];
  if (!file || !selectedExamIdForImport) return;
  
  const formData = new FormData();
  formData.append('file', file);
  showToast('Đang xếp chỗ thí sinh...', 'info');
  
  try {
    const response = await fetch(`${API_BASE}/schedules/exam/${selectedExamIdForImport}/import-students`, {
      method: 'POST',
      body: formData
    });
    const result = await response.json();
    if (response.ok && result.success) {
      showToast(`Xếp chỗ thành công cho ${result.data?.seatsAssigned || 0} thí sinh.`, 'success');
      loadAdminExamSchedules();
    } else {
      showToast('Lỗi nhập Excel: ' + result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối: ' + err.message, 'error');
  } finally {
    selectedExamIdForImport = null;
  }
};

// --- Form Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  if (!ensureAdminLoggedIn()) return;
  setupAdminSubnav();

  // Load initial subtab data
  loadStudents();
  loadCourses();

  // Student Form
  const studentForm = document.getElementById('student-form');
  if (studentForm) {
    studentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('student-form-id').value;
      const payload = {
        studentCode: document.getElementById('student-form-code').value,
        fullName: document.getElementById('student-form-name').value,
        dateOfBirth: document.getElementById('student-form-dob').value,
        className: document.getElementById('student-form-class').value,
        status: 'ACTIVE'
      };

      try {
        const url = id ? `${API_BASE}/students/${id}` : `${API_BASE}/students`;
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
          showToast(id ? 'Cập nhật sinh viên thành công!' : 'Thêm sinh viên mới thành công!', 'success');
          closeStudentModal();
          loadStudents();
        } else {
          showToast('Lỗi: ' + res.message, 'error');
        }
      } catch (err) {
        showToast('Lỗi gửi dữ liệu: ' + err.message, 'error');
      }
    });
  }

  // Student Search
  const searchInput = document.getElementById('admin-student-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = adminState.students.filter(s => 
        s.studentCode.toLowerCase().includes(q) || 
        s.fullName.toLowerCase().includes(q) ||
        (s.className && s.className.toLowerCase().includes(q))
      );
      renderAdminStudents(filtered);
    });
  }

  // Course Form
  const courseForm = document.getElementById('course-form');
  if (courseForm) {
    courseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('course-form-id').value;
      const payload = {
        courseCode: document.getElementById('course-form-code').value,
        courseName: document.getElementById('course-form-name').value
      };

      try {
        const url = id ? `${API_BASE}/schedules/courses/${id}` : `${API_BASE}/schedules/courses`;
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
          showToast('Lưu môn học thành công!', 'success');
          closeCourseModal();
          loadCourses();
        } else {
          showToast('Lỗi: ' + res.message, 'error');
        }
      } catch (err) {
        showToast('Lỗi: ' + err.message, 'error');
      }
    });
  }

  // Class Schedule Form
  const classForm = document.getElementById('class-schedule-form');
  if (classForm) {
    classForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('class-schedule-form-id').value;
      const payload = {
        courseId: Number(document.getElementById('class-schedule-form-course').value),
        roomName: document.getElementById('class-schedule-form-room').value,
        startTime: document.getElementById('class-schedule-form-start').value,
        endTime: document.getElementById('class-schedule-form-end').value
      };

      try {
        const url = id ? `${API_BASE}/schedules/class/${id}` : `${API_BASE}/schedules/class`;
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
          showToast('Lưu ca học thành công!', 'success');
          closeClassScheduleModal();
          loadAdminClassSchedules();
        } else {
          showToast('Lỗi: ' + res.message, 'error');
        }
      } catch (err) {
        showToast('Lỗi: ' + err.message, 'error');
      }
    });
  }

  // Exam Schedule Form
  const examForm = document.getElementById('exam-schedule-form');
  if (examForm) {
    examForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('exam-schedule-form-id').value;
      const payload = {
        courseId: Number(document.getElementById('exam-schedule-form-course').value),
        examRoom: document.getElementById('exam-schedule-form-room').value,
        examTime: document.getElementById('exam-schedule-form-time').value
      };

      try {
        const url = id ? `${API_BASE}/schedules/exam/${id}` : `${API_BASE}/schedules/exam`;
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
          showToast('Lưu ca thi thành công!', 'success');
          closeExamScheduleModal();
          loadAdminExamSchedules();
        } else {
          showToast('Lỗi: ' + res.message, 'error');
        }
      } catch (err) {
        showToast('Lỗi: ' + err.message, 'error');
      }
    });
  }

  // OpenCV Register Button in Modal
  const btnModalLaunchOpencv = document.getElementById('btn-modal-launch-opencv');
  if (btnModalLaunchOpencv) {
    btnModalLaunchOpencv.addEventListener('click', () => {
      launchOpenCvRegister(adminState.regTargetCode, adminState.regFullName, adminState.regClassName);
    });
  }

  // Face Capture in Modal
  const btnRegCapture = document.getElementById('btn-reg-capture');
  if (btnRegCapture) {
    btnRegCapture.addEventListener('click', async () => {
      if (!adminState.regTargetCode) return;
      const regVideo = document.getElementById('reg-camera-feed');
      if (!regVideo) return;

      btnRegCapture.disabled = true;
      btnRegCapture.innerHTML = '<span>⏳</span> Đang trích xuất vector AI...';
      const base64Image = captureFrame(regVideo);

      try {
        const response = await fetch(`${API_BASE}/students/register-face`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentCode: adminState.regTargetCode,
            image: base64Image
          })
        });
        const res = await response.json();
        if (res.success) {
          showToast('Đăng ký khuôn mặt thành công!', 'success');
          closeRegModal();
          loadStudents();
        } else {
          showToast('Đăng ký thất bại: ' + res.message, 'error');
        }
      } catch (e) {
        showToast('Lỗi gửi ảnh: ' + e.message, 'error');
      } finally {
        btnRegCapture.disabled = false;
        btnRegCapture.innerHTML = '<span>📸</span> Chụp & Lưu Face ID';
      }
    });
  }

  // Eligibility Select
  const elSelect = document.getElementById('admin-eligibility-exam-select');
  if (elSelect) {
    elSelect.addEventListener('change', (e) => {
      adminState.adminSelectedExamId = e.target.value;
      fetchEligibilitiesForExam(adminState.adminSelectedExamId);
    });
  }
});
