const API_BASE = 'http://localhost:8080/api';

// State Management
const state = {
  activeTab: 'class-attendance',
  activeAdminSubTab: 'admin-students',
  stream: null,
  isScanning: false,
  autoScanInterval: null,
  courses: [],
  classSchedules: [],
  examSchedules: [],
  students: [],
  selectedScheduleId: null,
  selectedExamScheduleId: null,
  adminSelectedExamId: null,
  registrationTargetCode: null,
  regStream: null,
  attendanceVotes: {},
  markedPresent: new Set(),
  voteThreshold: 3,
  smoothBbox: null
};

// UI Elements Map
const elements = {
  video: document.getElementById('camera-feed'),
  examVideo: document.getElementById('exam-camera-feed'),
  canvas: document.getElementById('capture-canvas'),
  faceBox: document.getElementById('face-box'),
  examFaceBox: document.getElementById('exam-face-box'),
  laserLine: document.getElementById('scan-laser'),
  examLaserLine: document.getElementById('exam-scan-laser'),
  autoScanToggle: document.getElementById('auto-scan-toggle'),
  examAutoScanToggle: document.getElementById('exam-auto-scan-toggle'),
  btnCapture: document.getElementById('btn-capture'),
  classScheduleSelect: document.getElementById('class-schedule-select'),
  examScheduleSelect: document.getElementById('exam-schedule-select'),
  classResultCard: document.getElementById('class-result-card'),
  examResultCard: document.getElementById('exam-result-card'),
  classAttendanceTable: document.getElementById('class-attendance-tbody'),
  examAttendanceTable: document.getElementById('exam-attendance-tbody'),
  toastContainer: document.getElementById('toast-container'),
  statStudentCount: document.getElementById('stat-student-count'),
  statActiveClass: document.getElementById('stat-active-class'),
  statExamCount: document.getElementById('stat-exam-count'),
  openCvCanvas: document.getElementById('opencv-canvas-overlay'),
  examOpenCvCanvas: document.getElementById('exam-opencv-canvas-overlay'),
  headerDynamicTitle: document.getElementById('header-dynamic-title'),
  headerDynamicDesc: document.getElementById('header-dynamic-desc'),
  // Admin Elements
  adminStudentsTbody: document.getElementById('admin-students-tbody'),
  adminCoursesTbody: document.getElementById('admin-courses-tbody'),
  adminClassTbody: document.getElementById('admin-class-schedules-tbody'),
  adminExamTbody: document.getElementById('admin-exam-schedules-tbody'),
  adminEligibilityTbody: document.getElementById('admin-eligibility-tbody'),
  adminEligibilityExamSelect: document.getElementById('admin-eligibility-exam-select'),
  adminStudentSearch: document.getElementById('admin-student-search'),
  // Schedules View Tab
  manageCoursesTbody: document.getElementById('manage-courses-tbody'),
  manageClassTbody: document.getElementById('manage-class-tbody'),
  manageExamTbody: document.getElementById('manage-exam-tbody'),
  // Modals
  regModal: document.getElementById('register-modal'),
  regVideo: document.getElementById('reg-camera-feed'),
  regTargetInfo: document.getElementById('reg-target-info'),
  regFaceBox: document.getElementById('reg-face-box'),
  regLaserLine: document.getElementById('reg-scan-laser'),
  regDetectorChip: document.getElementById('reg-ai-detector-chip'),
  regDetectorText: document.getElementById('reg-ai-detector-text'),
  regHudFaceTag: document.getElementById('reg-hud-face-tag'),
  regStudentNameVal: document.getElementById('reg-student-name-val'),
  regStudentCodeVal: document.getElementById('reg-student-code-val'),
  regStudentClassVal: document.getElementById('reg-student-class-val'),
  regFaceStatusPill: document.getElementById('reg-face-status-pill'),
  btnRegCapture: document.getElementById('btn-reg-capture'),
  studentModal: document.getElementById('student-modal'),
  courseModal: document.getElementById('course-modal'),
  classScheduleModal: document.getElementById('class-schedule-modal'),
  examScheduleModal: document.getElementById('exam-schedule-modal')
};

// --- Notifications / Toast ---
function showToast(message, type = 'info') {
  if (!elements.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `inodino-toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// --- Main Tab Navigation ---
const tabHeaders = {
  'class-attendance': {
    title: 'HỆ THỐNG ĐIỂM DANH <br /><span>NHẬN DIỆN KHUÔN MẶT</span>',
    desc: 'Giải pháp xác thực sinh viên và kiểm soát điều kiện dự thi tự động bằng trí tuệ nhân tạo (FaceNet & PyTorch), kết nối Spring Boot Backend và MySQL.'
  },
  'exam-verification': {
    title: 'XÁC THỰC & KIỂM SOÁT <br /><span>PHÒNG THI THỜI GIAN THỰC</span>',
    desc: 'Đối chiếu danh sách điều kiện dự thi và cảnh báo ngay lập tức nếu thí sinh vi phạm quy chế hoặc BỊ CẤM THI.'
  },
  'admin-portal': {
    title: 'TRANG QUẢN TRỊ <br /><span>HỆ THỐNG ĐIỂM DANH</span>',
    desc: 'Quản lý toàn bộ danh sách sinh viên, đăng ký Face ID, môn học, giờ học, ca thi và kiểm soát cấm thi.'
  },
  'schedules-manage': {
    title: 'DANH MỤC MÔN HỌC <br /><span>VÀ LỊCH TRÌNH ĐÀO TẠO</span>',
    desc: 'Tra cứu thông tin môn học, lịch học các ca trong tuần và lịch thi tại các phòng thi.'
  },
  'about-section': {
    title: 'KIẾN TRÚC CÔNG NGHỆ <br /><span>TRÍ TUỆ NHÂN TẠO AI</span>',
    desc: 'Mô hình xử lý AI (MTCNN & InceptionResnetV1 VGGFace2) kết hợp Spring Boot Backend và WebRTC Client.'
  }
};

function setupTabListeners() {
  document.querySelectorAll('.nav-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      
      if (tabName === 'admin-portal') {
        const adminUser = localStorage.getItem('adminUser');
        if (!adminUser) {
          state.previousTab = state.activeTab || 'class-attendance';
          openLoginModal();
          return;
        }
      }
      
      switchTab(tabName);
    });
  });

  // Check login status initially
  checkAdminLoginStatus();

  // Admin Subnav listeners
  document.querySelectorAll('.admin-subnav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subtabName = btn.dataset.subtab;
      document.querySelectorAll('.admin-subnav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-sub-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetSubPane = document.getElementById(`subtab-${subtabName}`);
      if (targetSubPane) targetSubPane.classList.add('active');
      state.activeAdminSubTab = subtabName;

      if (subtabName === 'admin-students') loadStudents();
      else if (subtabName === 'admin-courses') loadCourses();
      else if (subtabName === 'admin-class-schedules') loadAdminClassSchedules();
      else if (subtabName === 'admin-exam-schedules') loadAdminExamSchedules();
      else if (subtabName === 'admin-eligibility') loadAdminEligibility();
    });
  });
}

function switchTab(tabName) {
  const btn = document.querySelector(`.nav-item-btn[data-tab="${tabName}"]`);
  if (!btn) return;
  
  // Update nav button active states
  document.querySelectorAll('.nav-item-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Update pane active states
  document.querySelectorAll('.tab-pane-module').forEach(p => p.classList.remove('active'));
  const targetPane = document.getElementById(`tab-${tabName}`);
  if (targetPane) {
    targetPane.classList.add('active');
  }

  state.activeTab = tabName;

  // Update hero header text
  if (tabHeaders[tabName] && elements.headerDynamicTitle && elements.headerDynamicDesc) {
    elements.headerDynamicTitle.innerHTML = tabHeaders[tabName].title;
    elements.headerDynamicDesc.innerText = tabHeaders[tabName].desc;
  }

  // Load data for specific tabs
  if (tabName === 'admin-portal') {
    loadAdminData();
    renderLogoutButton();
  } else {
    removeLogoutButton();
  }
  
  if (tabName === 'schedules-manage') {
    loadSchedulesManageView();
  }
}



window.launchDesktopOpenCV = async function() {
  try {
    let scheduleIdToPass = '';
    
    if (state.activeTab === 'class-attendance') {
      if (!state.selectedScheduleId) {
        showToast('Vui lòng chọn Ca học / Môn học trước khi bật Camera', 'warning');
        return;
      }
      scheduleIdToPass = state.selectedScheduleId;
    } else if (state.activeTab === 'exam-verification') {
      if (!state.selectedExamScheduleId) {
        showToast('Vui lòng chọn Ca thi / Phòng thi trước khi bật Camera', 'warning');
        return;
      }
      scheduleIdToPass = state.selectedExamScheduleId;
    }

    showToast('Đang kích hoạt Camera Python (OpenCV) trên màn hình...', 'info');
    const response = await fetch(`${API_BASE}/attendance/launch-desktop-scan?scheduleId=${scheduleIdToPass}`, {
      method: 'POST'
    });
    const result = await response.json();
    if (result.success) {
      showToast('🚀 ' + (result.message || 'Khởi chạy OpenCV Desktop thành công! Cửa sổ OpenCV đã mở trên desktop.'), 'success');
    } else {
      showToast('Không thể mở OpenCV Desktop: ' + result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi gửi yêu cầu mở OpenCV Desktop: ' + err.message, 'error');
  }
};

const btnLaunchDesktop = document.getElementById('btn-launch-desktop');
if (btnLaunchDesktop) {
  btnLaunchDesktop.addEventListener('click', () => {
    window.launchDesktopOpenCV();
  });
}

const btnQuickRegister = document.getElementById('btn-quick-register');
if (btnQuickRegister) {
  btnQuickRegister.addEventListener('click', async () => {
    const studentCode = prompt('Vui lòng nhập Mã Sinh Viên cần đăng ký khuôn mặt:');
    if (!studentCode || studentCode.trim() === '') {
      showToast('Đã hủy đăng ký khuôn mặt', 'info');
      return;
    }
    
    showToast(`Đang khởi động Camera Python để đăng ký cho SV ${studentCode}...`, 'info');
    try {
      const response = await fetch(`${API_BASE}/attendance/launch-register-scan?studentCode=${studentCode.trim()}`, {
        method: 'POST'
      });
      const result = await response.json();
      if (result.success) {
        showToast('🚀 ' + (result.message || 'Cửa sổ đăng ký khuôn mặt đã mở trên màn hình.'), 'success');
      } else {
        showToast('Lỗi: ' + result.message, 'error');
      }
    } catch (err) {
      showToast('Không thể gọi API đăng ký: ' + err.message, 'error');
    }
  });
}

function renderOpenCVBbox(boxElement, bbox, isSuccess = true, labelText = "") {
  if (!boxElement) return;

  let labelTag = boxElement.querySelector('.opencv-label-tag');
  if (!labelTag) {
    labelTag = document.createElement('div');
    labelTag.className = 'opencv-label-tag';
    boxElement.appendChild(labelTag);
  }

  if (!bbox || bbox.length < 4) {
    boxElement.className = `face-focus-target opencv-style ${isSuccess ? 'success' : 'danger'}`;
    if (labelText) {
      labelTag.textContent = labelText;
      labelTag.style.display = 'block';
    }
    setTimeout(() => {
      boxElement.className = 'face-focus-target';
      if (labelTag) labelTag.style.display = 'none';
    }, 1800);
    return;
  }

  const targetVideo = (state.activeTab === 'exam-verification' && elements.examVideo) ? elements.examVideo : elements.video;
  const parentContainer = targetVideo ? targetVideo.parentElement : null;
  if (!parentContainer) return;

  const containerWidth = parentContainer.clientWidth || 640;
  const containerHeight = parentContainer.clientHeight || 480;
  const frameWidth = targetVideo.videoWidth || 640;
  const frameHeight = targetVideo.videoHeight || 480;

  const scaleX = containerWidth / frameWidth;
  const scaleY = containerHeight / frameHeight;

  // Mirrored video coordinates:
  const rawX1 = bbox[0];
  const rawY1 = bbox[1];
  const rawX2 = bbox[2];
  const rawY2 = bbox[3];

  const mirroredX1 = frameWidth - rawX2;
  const mirroredX2 = frameWidth - rawX1;

  const x1 = mirroredX1 * scaleX;
  const y1 = rawY1 * scaleY;
  const w = (mirroredX2 - mirroredX1) * scaleX;
  const h = (rawY2 - rawY1) * scaleY;

  boxElement.style.position = 'absolute';
  boxElement.style.left = `${x1}px`;
  boxElement.style.top = `${y1}px`;
  boxElement.style.width = `${w}px`;
  boxElement.style.height = `${h}px`;
  boxElement.style.transform = 'none';
  boxElement.className = `face-focus-target opencv-style ${isSuccess ? 'success' : 'danger'}`;

  if (labelText) {
    labelTag.textContent = labelText;
    labelTag.style.display = 'block';
  } else {
    labelTag.style.display = 'none';
  }

  setTimeout(() => {
    boxElement.style.left = '';
    boxElement.style.top = '';
    boxElement.style.width = '';
    boxElement.style.height = '';
    boxElement.style.transform = '';
    boxElement.className = 'face-focus-target';
    if (labelTag) labelTag.style.display = 'none';
  }, 2500);
}

// --- Initial Data Load ---
async function loadInitialData() {
  try {
    const [resClass, resExam, resStudents, resCourses] = await Promise.all([
      fetch(`${API_BASE}/schedules/class`).then(r => r.json()),
      fetch(`${API_BASE}/schedules/exam`).then(r => r.json()),
      fetch(`${API_BASE}/students`).then(r => r.json()),
      fetch(`${API_BASE}/schedules/courses`).then(r => r.json())
    ]);

    if (resStudents.success && resStudents.data) {
      state.students = resStudents.data;
      if (elements.statStudentCount) elements.statStudentCount.innerText = `${resStudents.data.length} Sinh viên`;
    }

    if (resCourses.success && resCourses.data) {
      state.courses = resCourses.data;
    }

    if (resClass.success && resClass.data) {
      state.classSchedules = resClass.data;
      if (elements.classScheduleSelect) {
        elements.classScheduleSelect.innerHTML = `
          <option value="">-- Vui lòng chọn Ca học / Môn học --</option>
          ${resClass.data.map(s => `
            <option value="${s.id}">
              ${s.course?.courseName || 'Môn học'} | ${s.roomName} (${formatDateTime(s.startTime)} - ${formatTime(s.endTime)})
            </option>
          `).join('')}
        `;
      }
    }

    if (resExam.success && resExam.data) {
      state.examSchedules = resExam.data;
      if (elements.statExamCount) elements.statExamCount.innerText = `${resExam.data.length} Ca thi`;
      if (elements.examScheduleSelect) {
        elements.examScheduleSelect.innerHTML = `
          <option value="">-- Vui lòng chọn Ca thi / Phòng thi --</option>
          ${resExam.data.map(e => `
            <option value="${e.id}">
              ${e.course?.courseName || 'Môn thi'} | ${e.examRoom} (${formatDateTime(e.examTime)})
            </option>
          `).join('')}
        `;
      }
    }
  } catch (e) {
    console.error('Error loading initial data:', e);
    showToast('Lỗi kết nối máy chủ Spring Boot', 'error');
  }
}

let attendancePollingInterval = null;

function startPolling(type) {
  if (attendancePollingInterval) clearInterval(attendancePollingInterval);
  attendancePollingInterval = setInterval(() => {
    if (type === 'class' && state.selectedScheduleId) {
      loadClassAttendance(state.selectedScheduleId);
    } else if (type === 'exam' && state.selectedExamScheduleId) {
      loadExamAttendance(state.selectedExamScheduleId);
    }
  }, 3000);
}

if (elements.classScheduleSelect) {
  elements.classScheduleSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    state.selectedScheduleId = val || null;

    if (val) {
      loadClassAttendance(val);
      startPolling('class');
    } else {
      if (attendancePollingInterval) clearInterval(attendancePollingInterval);
      if (elements.classAttendanceTable) {
        elements.classAttendanceTable.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Vui lòng chọn Ca học để xem dữ liệu điểm danh</td></tr>`;
      }
    }
  });
}

if (elements.examScheduleSelect) {
  elements.examScheduleSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    state.selectedExamScheduleId = val || null;

    if (val) {
      loadExamAttendance(val);
      startPolling('exam');
    } else {
      if (attendancePollingInterval) clearInterval(attendancePollingInterval);
      if (elements.examAttendanceTable) {
        elements.examAttendanceTable.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Vui lòng chọn Ca thi để xem dữ liệu</td></tr>`;
      }
    }
  });
}


async function loadClassAttendance(scheduleId) {
  try {
    const res = await fetch(`${API_BASE}/attendance/class/${scheduleId}`).then(r => r.json());
    if (res.success && res.data && elements.classAttendanceTable) {
      elements.classAttendanceTable.innerHTML = res.data.length === 0 
        ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Chưa có sinh viên nào điểm danh ca này</td></tr>`
        : res.data.map((item, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td><strong>${item.student?.studentCode}</strong></td>
              <td>${item.student?.fullName}</td>
              <td>${item.student?.className || '-'}</td>
              <td>${formatDateTime(item.checkInTime)}</td>
              <td>
                <span class="badge-tag ${item.status === 'PRESENT' ? 'present' : 'late'}">
                  ${item.status === 'PRESENT' ? 'Đúng giờ' : 'Đi muộn'}
                </span>
              </td>
            </tr>
          `).join('');
    }
  } catch (e) {
    console.error('Error loading class attendance:', e);
  }
}


async function loadExamAttendance(examScheduleId) {
  try {
    const [attRes, eligRes] = await Promise.all([
      fetch(`${API_BASE}/attendance/exam/${examScheduleId}`).then(r => r.json()),
      fetch(`${API_BASE}/schedules/exam/${examScheduleId}/eligibilities`).then(r => r.json())
    ]);
    
    if (attRes.success && attRes.data) {
      const examSchedule = state.examSchedules.find(e => e.id == examScheduleId);
      const cols = examSchedule?.seatingCols || 5;

      if (elements.examAttendanceTable) {
        elements.examAttendanceTable.innerHTML = attRes.data.length === 0 
          ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Chưa có thí sinh nào vào phòng thi</td></tr>`
          : attRes.data.map((item, idx) => {
              const hasSeat = item.seatRow !== null && item.seatCol !== null;
              const sbd = hasSeat 
                ? `SBD-${String((item.seatRow * cols) + item.seatCol + 1).padStart(2, '0')}`
                : `SBD-${String(idx + 1).padStart(2, '0')}`;

              return `
                <tr>
                  <td><strong style="color: var(--primary); font-weight: 700;">${sbd}</strong></td>
                  <td><strong>${item.student?.studentCode}</strong></td>
                  <td>${item.student?.fullName}</td>
                  <td>${item.student?.className || '-'}</td>
                  <td>${formatDateTime(item.checkInTime)}</td>
                  <td><span class="badge-tag present">Đã xác thực ${hasSeat ? `(${item.seatRow+1}-${item.seatCol+1})` : ''}</span></td>
                </tr>
              `;
            }).join('');
      }
      
      const eligibilities = (eligRes.success && eligRes.data) ? eligRes.data : [];
      
      // Render visual seating grid
      renderExamLiveSeatingChart(examScheduleId, attRes.data, eligibilities);
    }
  } catch (e) {
    console.error('Error loading exam attendance:', e);
  }
}

// ==============================================================
// --- ADMIN MANAGEMENT PORTAL ---
// ==============================================================
function loadAdminData() {
  if (state.activeAdminSubTab === 'admin-students') loadStudents();
  else if (state.activeAdminSubTab === 'admin-courses') loadCourses();
  else if (state.activeAdminSubTab === 'admin-class-schedules') loadAdminClassSchedules();
  else if (state.activeAdminSubTab === 'admin-exam-schedules') loadAdminExamSchedules();
  else if (state.activeAdminSubTab === 'admin-eligibility') loadAdminEligibility();
}

// 1. Quản lý Sinh viên
async function loadStudents() {
  try {
    const res = await fetch(`${API_BASE}/students`).then(r => r.json());
    if (res.success && res.data) {
      state.students = res.data;
      renderAdminStudents(state.students);
      if (elements.statStudentCount) elements.statStudentCount.innerText = `${res.data.length} Sinh viên`;
    }
  } catch (e) {
    showToast('Lỗi tải danh sách sinh viên', 'error');
  }
}

function renderAdminStudents(list) {
  if (!elements.adminStudentsTbody) return;
  elements.adminStudentsTbody.innerHTML = list.length === 0
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
            <div style="display: flex; gap: 4px;">
              <button class="inodino-btn inodino-btn-primary inodino-btn-sm" onclick="openFaceRegistrationModal('${st.studentCode}', '${st.fullName}', '${st.className || ''}', ${st.hasFaceRegistered})">
                📸 Face ID
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

if (elements.adminStudentSearch) {
  elements.adminStudentSearch.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = state.students.filter(s => 
      s.studentCode.toLowerCase().includes(q) || 
      s.fullName.toLowerCase().includes(q) ||
      (s.className && s.className.toLowerCase().includes(q))
    );
    renderAdminStudents(filtered);
  });
}

// Modal Sinh Viên CRUD
window.openCreateStudentModal = function() {
  document.getElementById('student-modal-title').innerHTML = '<span>👤</span> Thêm Sinh Viên Mới';
  document.getElementById('student-form-id').value = '';
  document.getElementById('student-form-code').value = '';
  document.getElementById('student-form-code').disabled = false;
  document.getElementById('student-form-name').value = '';
  document.getElementById('student-form-dob').value = '2005-01-01';
  document.getElementById('student-form-class').value = 'K23CNT3';
  elements.studentModal.classList.add('active');
};

window.openEditStudentModal = function(id, code, name, dob, className) {
  document.getElementById('student-modal-title').innerHTML = '<span>👤</span> Chỉnh Sửa Sinh Viên';
  document.getElementById('student-form-id').value = id;
  document.getElementById('student-form-code').value = code;
  document.getElementById('student-form-code').disabled = true;
  document.getElementById('student-form-name').value = name;
  document.getElementById('student-form-dob').value = dob || '';
  document.getElementById('student-form-class').value = className || '';
  elements.studentModal.classList.add('active');
};

window.closeStudentModal = function() {
  elements.studentModal.classList.remove('active');
};

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

// 2. Quản lý Môn Học (Courses CRUD)
async function loadCourses() {
  try {
    const res = await fetch(`${API_BASE}/schedules/courses`).then(r => r.json());
    if (res.success && res.data && elements.adminCoursesTbody) {
      state.courses = res.data;
      elements.adminCoursesTbody.innerHTML = res.data.length === 0
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
  elements.courseModal.classList.add('active');
};

window.openEditCourseModal = function(id, code, name) {
  document.getElementById('course-modal-title').innerHTML = '<span>📚</span> Sửa Môn Học';
  document.getElementById('course-form-id').value = id;
  document.getElementById('course-form-code').value = code;
  document.getElementById('course-form-name').value = name;
  elements.courseModal.classList.add('active');
};

window.closeCourseModal = function() {
  elements.courseModal.classList.remove('active');
};

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

// 3. Quản lý Lịch Học (Class Schedules CRUD)
async function loadAdminClassSchedules() {
  try {
    const res = await fetch(`${API_BASE}/schedules/class`).then(r => r.json());
    if (res.success && res.data && elements.adminClassTbody) {
      state.classSchedules = res.data;
      elements.adminClassTbody.innerHTML = res.data.length === 0
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
  courseSelect.innerHTML = state.courses.map(c => `<option value="${c.id}">${c.courseName} (${c.courseCode})</option>`).join('');
  
  const now = new Date();
  const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  document.getElementById('class-schedule-form-start').value = toLocalISOString(now);
  document.getElementById('class-schedule-form-end').value = toLocalISOString(later);
  
  elements.classScheduleModal.classList.add('active');
};

window.openEditClassScheduleModal = function(id, courseId, room, start, end) {
  document.getElementById('class-schedule-modal-title').innerHTML = '<span>🏫</span> Sửa Ca Học';
  document.getElementById('class-schedule-form-id').value = id;
  document.getElementById('class-schedule-form-room').value = room;
  
  const courseSelect = document.getElementById('class-schedule-form-course');
  courseSelect.innerHTML = state.courses.map(c => `<option value="${c.id}" ${c.id == courseId ? 'selected' : ''}>${c.courseName}</option>`).join('');
  
  document.getElementById('class-schedule-form-start').value = start ? start.substring(0, 16) : '';
  document.getElementById('class-schedule-form-end').value = end ? end.substring(0, 16) : '';
  
  elements.classScheduleModal.classList.add('active');
};

window.closeClassScheduleModal = function() {
  elements.classScheduleModal.classList.remove('active');
};

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
        loadInitialData();
      } else {
        showToast('Lỗi: ' + res.message, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  });
}

window.deleteClassSchedule = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa ca học này?')) return;
  try {
    const res = await fetch(`${API_BASE}/schedules/class/${id}`, { method: 'DELETE' }).then(r => r.json());
    if (res.success) {
      showToast('Đã xóa ca học', 'success');
      loadAdminClassSchedules();
      loadInitialData();
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
};

// 4. Quản lý Ca Thi (Exam Schedules CRUD)
async function loadAdminExamSchedules() {
  try {
    const res = await fetch(`${API_BASE}/schedules/exam`).then(r => r.json());
    if (res.success && res.data && elements.adminExamTbody) {
      state.examSchedules = res.data;
      elements.adminExamTbody.innerHTML = res.data.length === 0
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
  courseSelect.innerHTML = state.courses.map(c => `<option value="${c.id}">${c.courseName} (${c.courseCode})</option>`).join('');
  
  const now = new Date(Date.now() + 24 * 60 * 60 * 1000);
  document.getElementById('exam-schedule-form-time').value = toLocalISOString(now);
  
  elements.examScheduleModal.classList.add('active');
};

window.openEditExamScheduleModal = function(id, courseId, room, time) {
  document.getElementById('exam-schedule-modal-title').innerHTML = '<span>📝</span> Sửa Ca Thi';
  document.getElementById('exam-schedule-form-id').value = id;
  document.getElementById('exam-schedule-form-room').value = room;
  
  const courseSelect = document.getElementById('exam-schedule-form-course');
  courseSelect.innerHTML = state.courses.map(c => `<option value="${c.id}" ${c.id == courseId ? 'selected' : ''}>${c.courseName}</option>`).join('');
  
  document.getElementById('exam-schedule-form-time').value = time ? time.substring(0, 16) : '';
  
  elements.examScheduleModal.classList.add('active');
};

window.closeExamScheduleModal = function() {
  elements.examScheduleModal.classList.remove('active');
};

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
        loadInitialData();
      } else {
        showToast('Lỗi: ' + res.message, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  });
}

window.deleteExamSchedule = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa ca thi này?')) return;
  try {
    const res = await fetch(`${API_BASE}/schedules/exam/${id}`, { method: 'DELETE' }).then(r => r.json());
    if (res.success) {
      showToast('Đã xóa ca thi', 'success');
      loadAdminExamSchedules();
      loadInitialData();
    } else {
      showToast('Lỗi: ' + res.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
};

// 5. Quản lý Điều kiện thi & Cấm thi (Exam Eligibility)
async function loadAdminEligibility() {
  try {
    const resExams = await fetch(`${API_BASE}/schedules/exam`).then(r => r.json());
    if (resExams.success && resExams.data && resExams.data.length > 0 && elements.adminEligibilityExamSelect) {
      state.examSchedules = resExams.data;
      elements.adminEligibilityExamSelect.innerHTML = resExams.data.map(e => `
        <option value="${e.id}">${e.course?.courseName || 'Môn thi'} | ${e.examRoom} (${formatDateTime(e.examTime)})</option>
      `).join('');
      
      state.adminSelectedExamId = state.adminSelectedExamId || resExams.data[0].id;
      elements.adminEligibilityExamSelect.value = state.adminSelectedExamId;
      fetchEligibilitiesForExam(state.adminSelectedExamId);
    }
  } catch (e) {
    showToast('Lỗi tải dữ liệu điều kiện thi', 'error');
  }
}

if (elements.adminEligibilityExamSelect) {
  elements.adminEligibilityExamSelect.addEventListener('change', (e) => {
    state.adminSelectedExamId = e.target.value;
    fetchEligibilitiesForExam(state.adminSelectedExamId);
  });
}

async function fetchEligibilitiesForExam(examScheduleId) {
  try {
    const res = await fetch(`${API_BASE}/schedules/exam/${examScheduleId}/eligibilities`).then(r => r.json());
    if (res.success && res.data && elements.adminEligibilityTbody) {
      elements.adminEligibilityTbody.innerHTML = res.data.length === 0
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

// ==========================================================================
// Face Detection Engine (Native FaceDetector API + High-Speed Fallback)
// ==========================================================================
let nativeFaceDetector = null;
if ('FaceDetector' in window) {
  try {
    nativeFaceDetector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: true });
  } catch (e) {
    console.log('Native FaceDetector not available:', e);
  }
}

const detectionCanvas = document.createElement('canvas');
detectionCanvas.width = 160;
detectionCanvas.height = 120;
const detectionCtx = detectionCanvas.getContext('2d', { willReadFrequently: true });

async function detectFaceInVideo(video) {
  if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
  
  // 1. Try Native Browser FaceDetector
  if (nativeFaceDetector) {
    try {
      const faces = await nativeFaceDetector.detect(video);
      if (faces && faces.length > 0) {
        return {
          detected: true,
          box: faces[0].boundingBox
        };
      }
    } catch (e) {
      // Fallback
    }
  }
  
  // 2. High-speed Canvas Skin Tone & Facial Feature Analysis
  try {
    detectionCtx.drawImage(video, 0, 0, 160, 120);
    const imgData = detectionCtx.getImageData(0, 0, 160, 120);
    const data = imgData.data;
    let skinPixels = 0;
    
    for (let y = 0; y < 120; y += 2) {
      for (let x = 0; x < 160; x += 2) {
        const idx = (y * 160 + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Skin chromaticity check
        if (r > 60 && g > 40 && b > 20 &&
            r > g && r > b &&
            (r - g) > 10 && (r - b) > 15 &&
            Math.abs(r - g) < 140) {
          skinPixels++;
        }
      }
    }
    
    const totalSampled = (160 * 120) / 4;
    const skinRatio = skinPixels / totalSampled;
    
    if (skinPixels > 160 && skinRatio > 0.04 && skinRatio < 0.85) {
      return { detected: true };
    }
    return null;
  } catch (err) {
    return null;
  }
}

function startRegFaceDetection() {
  if (state.regDetectionInterval) clearInterval(state.regDetectionInterval);
  
  state.regDetectionInterval = setInterval(async () => {
    if (!elements.regVideo || elements.regVideo.paused || elements.regVideo.ended) return;
    
    const res = await detectFaceInVideo(elements.regVideo);
    const box = elements.regFaceBox || document.getElementById('reg-face-box');
    const chip = elements.regDetectorChip || document.getElementById('reg-ai-detector-chip');
    const chipText = elements.regDetectorText || document.getElementById('reg-ai-detector-text');
    const hudTag = elements.regHudFaceTag || document.getElementById('reg-hud-face-tag');
    
    if (res && res.detected) {
      if (box) {
        box.classList.add('detected');
        box.classList.remove('danger');
      }
      if (chip) {
        chip.className = 'ai-detector-chip detected';
      }
      if (chipText) {
        chipText.innerText = 'Đã phát hiện khuôn mặt';
      }
      if (hudTag) {
        hudTag.innerText = '✓ Khuôn mặt hợp lệ';
      }
    } else {
      if (box) {
        box.classList.remove('detected');
      }
      if (chip) {
        chip.className = 'ai-detector-chip searching';
      }
      if (chipText) {
        chipText.innerText = 'Đang tìm khuôn mặt...';
      }
      if (hudTag) {
        hudTag.innerText = 'Face AI Scanner';
      }
    }
  }, 120);
}

function stopRegFaceDetection() {
  if (state.regDetectionInterval) {
    clearInterval(state.regDetectionInterval);
    state.regDetectionInterval = null;
  }
}

window.setRegFrameStyle = function(style) {
  state.regFrameStyle = style;
  const box = document.getElementById('reg-face-box');
  const buttons = document.querySelectorAll('.btn-hud-style');
  
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-style') === style);
  });
  
  if (box) {
    box.classList.remove('bracket-mode-corners', 'bracket-mode-square', 'bracket-mode-oval');
    if (style === 'corners') {
      box.classList.add('bracket-mode-corners');
    } else if (style === 'square') {
      box.classList.add('bracket-mode-square');
    } else if (style === 'oval') {
      box.classList.add('bracket-mode-oval');
    }
  }
};

// Modal Đăng ký Face ID
window.openFaceRegistrationModal = async function(studentCode, fullName, className = '', hasFaceRegistered = false) {
  state.registrationTargetCode = studentCode;
  
  // Find student in state if missing info
  const studentObj = state.students ? state.students.find(s => s.studentCode === studentCode) : null;
  const displayFullName = fullName || (studentObj ? studentObj.fullName : 'Sinh viên');
  const displayClass = className || (studentObj ? studentObj.className : 'Chưa cập nhật');
  const isRegistered = hasFaceRegistered || (studentObj ? studentObj.hasFaceRegistered : false);

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

  elements.regModal.classList.add('active');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    });
    elements.regVideo.srcObject = stream;
    state.regStream = stream;
    await elements.regVideo.play();
    
    startRegFaceDetection();
  } catch (err) {
    showToast('Lỗi mở camera: ' + err.message, 'error');
  }
};

window.closeRegModal = function() {
  elements.regModal.classList.remove('active');
  stopRegFaceDetection();
  if (state.regStream) {
    state.regStream.getTracks().forEach(t => t.stop());
    state.regStream = null;
  }
};

if (elements.btnRegCapture) {
  elements.btnRegCapture.addEventListener('click', async () => {
    if (!state.registrationTargetCode) return;
    
    elements.btnRegCapture.disabled = true;
    elements.btnRegCapture.innerHTML = '<span>⏳</span> Đang trích xuất vector AI...';
    
    const base64Image = captureFrame(elements.regVideo);
    
    try {
      const response = await fetch(`${API_BASE}/students/register-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentCode: state.registrationTargetCode,
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
      elements.btnRegCapture.disabled = false;
      elements.btnRegCapture.innerHTML = '<span>📸</span> Chụp & Lưu Face ID';
    }
  });
}

window.handleImageUploadForReg = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Image = e.target.result;
    if (!state.registrationTargetCode) return;

    try {
      showToast('Đang gửi ảnh lên AI Service...', 'info');
      const response = await fetch(`${API_BASE}/students/register-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentCode: state.registrationTargetCode,
          image: base64Image
        })
      });
      const res = await response.json();
      if (res.success) {
        showToast('Đăng ký Face ID từ ảnh thành công!', 'success');
        closeRegModal();
        loadStudents();
      } else {
        showToast('Lỗi: ' + res.message, 'error');
      }
    } catch (err) {
      showToast('Lỗi upload: ' + err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
};

// --- Schedules Manage View Tab ---
async function loadSchedulesManageView() {
  try {
    const [resCourses, resClass, resExam] = await Promise.all([
      fetch(`${API_BASE}/schedules/courses`).then(r => r.json()),
      fetch(`${API_BASE}/schedules/class`).then(r => r.json()),
      fetch(`${API_BASE}/schedules/exam`).then(r => r.json())
    ]);

    if (resCourses.success && resCourses.data && elements.manageCoursesTbody) {
      elements.manageCoursesTbody.innerHTML = resCourses.data.map(c => `
        <tr>
          <td><strong>${c.courseCode}</strong></td>
          <td>${c.courseName}</td>
        </tr>
      `).join('');
    }

    if (resClass.success && resClass.data && elements.manageClassTbody) {
      elements.manageClassTbody.innerHTML = resClass.data.map(s => `
        <tr>
          <td><strong>${s.course?.courseName || '-'}</strong></td>
          <td>${s.roomName}</td>
          <td>${formatDateTime(s.startTime)}</td>
          <td>${formatDateTime(s.endTime)}</td>
        </tr>
      `).join('');
    }

    if (resExam.success && resExam.data && elements.manageExamTbody) {
      elements.manageExamTbody.innerHTML = resExam.data.map(e => `
        <tr>
          <td><strong>${e.course?.courseName || '-'}</strong></td>
          <td>${e.examRoom}</td>
          <td>${formatDateTime(e.examTime)}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.error('Error loading schedules manage view:', e);
  }
}

// Helpers
function formatDateTime(dtStr) {
  if (!dtStr) return '-';
  const d = new Date(dtStr);
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(dtStr) {
  if (!dtStr) return '-';
  const d = new Date(dtStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function toLocalISOString(date) {
  const pad = (n) => (n < 10 ? '0' + n : n);
  return date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes());
}

// --- Administrator Authentication & Seating Layout Operations ---

// 1. Authentication Status Checks
function checkAdminLoginStatus() {
  const adminUser = localStorage.getItem('adminUser');
  if (adminUser) {
    state.isAdminLoggedIn = true;
    state.adminUser = JSON.parse(adminUser);
  }
}

function renderLogoutButton() {
  const statusBox = document.querySelector('.header-status-box');
  if (!statusBox) return;
  
  if (document.getElementById('admin-logout-btn')) return;
  
  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'admin-logout-btn';
  logoutBtn.className = 'inodino-btn inodino-btn-danger inodino-btn-sm admin-logout-btn';
  logoutBtn.style.marginLeft = '12px';
  logoutBtn.innerHTML = '<span>🔒</span> Đăng xuất';
  logoutBtn.addEventListener('click', handleAdminLogout);
  
  statusBox.appendChild(logoutBtn);
}

function removeLogoutButton() {
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (logoutBtn) logoutBtn.remove();
}

function handleAdminLogout() {
  if (confirm('Bạn có chắc muốn đăng xuất?')) {
    localStorage.removeItem('adminUser');
    state.isAdminLoggedIn = false;
    state.adminUser = null;
    removeLogoutButton();
    showToast('Đã đăng xuất tài khoản quản trị', 'info');
    switchTab('class-attendance');
  }
}

// 2. Modals opening & closing
window.openLoginModal = function() {
  const loginModal = document.getElementById('login-modal');
  if (loginModal) {
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error-msg').style.display = 'none';
    loginModal.classList.add('active');
  }
};

window.closeLoginModal = function() {
  const loginModal = document.getElementById('login-modal');
  if (loginModal) {
    loginModal.classList.remove('active');
    if (state.activeTab === 'admin-portal') {
      switchTab(state.previousTab || 'class-attendance');
    }
  }
};

// Handle login submit
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value.trim();
    const errorMsg = document.getElementById('login-error-msg');
    
    try {
      const response = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        localStorage.setItem('adminUser', JSON.stringify(result.data));
        state.isAdminLoggedIn = true;
        state.adminUser = result.data;
        
        // Hide modal
        const loginModal = document.getElementById('login-modal');
        if (loginModal) loginModal.classList.remove('active');
        
        showToast(`Xin chào ${result.data.fullName}! Đăng nhập thành công.`, 'success');
        
        // Switch to admin portal
        switchTab('admin-portal');
      } else {
        errorMsg.innerText = result.message || 'Tài khoản hoặc mật khẩu không đúng';
        errorMsg.style.display = 'block';
      }
    } catch (err) {
      errorMsg.innerText = 'Lỗi kết nối máy chủ backend';
      errorMsg.style.display = 'block';
    }
  });
}

// 3. Seating Chart setup in Admin Panel
window.openSeatingModalForExam = function(examId) {
  const e = state.examSchedules.find(x => x.id == examId);
  if (!e) return;
  
  state.adminSeatingExamId = examId;
  
  const rows = e.seatingRows || 5;
  const cols = e.seatingCols || 5;
  
  document.getElementById('seating-input-rows').value = rows;
  document.getElementById('seating-input-cols').value = cols;
  
  try {
    state.adminDisabledSeats = (e.disabledSeats && e.disabledSeats !== 'null') ? JSON.parse(e.disabledSeats) : [];
  } catch (err) {
    console.error('Error parsing disabled seats:', err);
    state.adminDisabledSeats = [];
  }
  
  renderSeatingSetupGrid(rows, cols);
  
  const modal = document.getElementById('seating-modal');
  if (modal) modal.classList.add('active');
};

window.closeSeatingModal = function() {
  const modal = document.getElementById('seating-modal');
  if (modal) modal.classList.remove('active');
};

window.regenerateSeatingGrid = function() {
  const rows = parseInt(document.getElementById('seating-input-rows').value) || 5;
  const cols = parseInt(document.getElementById('seating-input-cols').value) || 5;
  
  if (rows < 1 || rows > 10 || cols < 1 || cols > 10) {
    showToast('Kích thước phòng thi giới hạn từ 1x1 đến 10x10', 'warning');
    return;
  }
  
  state.adminDisabledSeats = state.adminDisabledSeats.filter(coord => {
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
      
      const isDisabled = state.adminDisabledSeats.includes(coord);
      if (isDisabled) {
        seatBox.classList.add('disabled-seat');
      }
      
      seatBox.addEventListener('click', () => {
        if (state.adminDisabledSeats.includes(coord)) {
          state.adminDisabledSeats = state.adminDisabledSeats.filter(x => x !== coord);
          seatBox.classList.remove('disabled-seat');
        } else {
          state.adminDisabledSeats.push(coord);
          seatBox.classList.add('disabled-seat');
        }
      });
      
      container.appendChild(seatBox);
    }
  }
}

window.saveSeatingLayout = async function() {
  if (!state.adminSeatingExamId) return;
  
  const rows = parseInt(document.getElementById('seating-input-rows').value) || 5;
  const cols = parseInt(document.getElementById('seating-input-cols').value) || 5;
  
  const payload = {
    seatingRows: rows,
    seatingCols: cols,
    disabledSeats: JSON.stringify(state.adminDisabledSeats)
  };
  
  try {
    const response = await fetch(`${API_BASE}/schedules/exam/${state.adminSeatingExamId}/seating`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    if (response.ok && result.success) {
      showToast('Đã cập nhật sơ đồ phòng thi thành công!', 'success');
      closeSeatingModal();
      loadAdminExamSchedules();
      loadInitialData();
    } else {
      showToast('Lỗi: ' + result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  }
};

// 4. Rendering Visual 2D Seating Layout in Verification Tab
function renderExamLiveSeatingChart(examScheduleId, attendees, eligibilities = []) {
  const container = document.getElementById('exam-live-seating-chart');
  if (!container) return;
  
  const examSchedule = state.examSchedules.find(e => e.id == examScheduleId);
  if (!examSchedule) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px;">Không tìm thấy thông tin cấu hình phòng thi</div>`;
    return;
  }
  
  const rows = examSchedule.seatingRows || 5;
  const cols = examSchedule.seatingCols || 5;
  let disabledSeats = [];
  try {
    disabledSeats = (examSchedule.disabledSeats && examSchedule.disabledSeats !== 'null') ? JSON.parse(examSchedule.disabledSeats) : [];
  } catch (e) {
    console.error('Error parsing disabled seats in live chart:', e);
  }
  
  container.innerHTML = '';
  
  const gridEl = document.createElement('div');
  gridEl.className = 'live-seating-grid';
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 60px)`;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const coord = `${r}-${c}`;
      const seatBox = document.createElement('div');
      
      const isDisabled = disabledSeats.includes(coord);
      if (isDisabled) {
        seatBox.className = 'live-seat-box disabled';
        seatBox.title = `Vị trí (${r+1}, ${c+1}) bị hỏng`;
      } else {
        const attendee = attendees.find(a => a.seatRow === r && a.seatCol === c);
        const eligible = eligibilities.find(el => el.seatRow === r && el.seatCol === c && el.isEligible);
        
        if (attendee) {
          seatBox.className = 'live-seat-box occupied';
          
          if (state.latestCheckedInSeat === coord) {
            seatBox.classList.add('just-checkin');
          }
          
          const fullName = attendee.student?.fullName || 'Sinh viên';
          const nameParts = fullName.split(' ');
          const shortName = nameParts[nameParts.length - 1];
          
          seatBox.innerHTML = `
            <span class="seat-name">${shortName}</span>
            <span class="seat-code">${attendee.student?.studentCode}</span>
            
            <div class="seat-tooltip">
              <strong>${fullName}</strong><br/>
              MSV: ${attendee.student?.studentCode}<br/>
              Lớp: ${attendee.student?.className || 'N/A'}<br/>
              Vào lúc: ${formatTime(attendee.checkInTime)}<br/>
              Hàng ${r+1}, Ghế ${c+1}
            </div>
          `;
        } else if (eligible) {
          // Thí sinh được xếp sẵn chỗ nhưng chưa check-in
          seatBox.className = 'live-seat-box expected';
          
          const fullName = eligible.student?.fullName || 'Sinh viên';
          const nameParts = fullName.split(' ');
          const shortName = nameParts[nameParts.length - 1];
          
          seatBox.innerHTML = `
            <span class="seat-name" style="color: #64748b; font-weight: 500;">${shortName}</span>
            <span class="seat-code" style="color: #94a3b8;">${eligible.student?.studentCode}</span>
            
            <div class="seat-tooltip">
              <strong>${fullName} (Chưa điểm danh)</strong><br/>
              MSV: ${eligible.student?.studentCode}<br/>
              Lớp: ${eligible.student?.className || 'N/A'}<br/>
              Trạng thái: Dự kiến xếp chỗ<br/>
              Hàng ${r+1}, Ghế ${c+1}
            </div>
          `;
        } else {
          seatBox.className = 'live-seat-box empty';
          seatBox.innerHTML = `
            <span style="font-size: 0.6rem; color: #94a3b8; margin-top: auto;">${r+1}-${c+1}</span>
            <div class="seat-tooltip" style="width: 120px; text-align: center;">
              Hàng ${r+1}, Cột ${c+1}<br/>(Trống)
            </div>
          `;
        }
      }
      gridEl.appendChild(seatBox);
    }
  }
  
  container.appendChild(gridEl);
  
  if (state.latestCheckedInSeat) {
    setTimeout(() => {
      state.latestCheckedInSeat = null;
      document.querySelectorAll('.live-seat-box.just-checkin').forEach(el => el.classList.remove('just-checkin'));
    }, 5000);
  }
}

// --- Excel Import/Export for Students ---

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
      
      let msg = `Nhập thành công ${data.importedCount} sinh viên.`;
      if (data.skippedCount > 0) {
        msg += ` Bỏ qua ${data.skippedCount} mã trùng lặp.`;
      }
      if (data.errorRows > 0) {
        msg += ` Lỗi ${data.errorRows} dòng.`;
      }
      
      showToast(msg, 'success');
      
      // Reload students table
      loadStudents();
      loadInitialData();
    } else {
      showToast('Lỗi nhập Excel: ' + result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  }
};

// --- Excel Import for Exam Candidates ---
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
      const data = result.data;
      
      let msg = `Xếp chỗ thành công ${data.seatsAssigned}/${data.importedCount} thí sinh.`;
      if (data.unassignedCount > 0) {
        msg += ` Thừa ${data.unassignedCount} thí sinh không có ghế.`;
      }
      if (data.errorRows > 0) {
        msg += ` Lỗi ${data.errorRows} dòng.`;
      }
      
      showToast(msg, 'success');
      
      // Reload admin exam schedules list
      loadAdminExamSchedules();
    } else {
      showToast('Lỗi nhập Excel phòng thi: ' + result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  } finally {
    selectedExamIdForImport = null;
  }
};

// Boot application
window.addEventListener('DOMContentLoaded', () => {
  setupTabListeners();
  // startMainCamera(); // Removed: user wants to manually start after selecting schedule
  loadInitialData();
});
