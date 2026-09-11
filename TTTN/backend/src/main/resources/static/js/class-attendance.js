/**
 * CLASS ATTENDANCE MODULE
 * Xử lý nghiệp vụ Điểm danh lớp học, gọi camera Python OpenCV và tra cứu kết quả
 */

const classAttendanceState = {
  selectedScheduleId: null,
  classSchedules: [],
  pollingInterval: null
};

async function loadClassSchedules() {
  try {
    const res = await fetch(`${API_BASE}/schedules/class`).then(r => r.json());
    if (res.success && res.data) {
      classAttendanceState.classSchedules = res.data;
      const select = document.getElementById('class-schedule-select');
      if (select) {
        select.innerHTML = `
          <option value="">-- Vui lòng chọn Ca học / Môn học --</option>
          ${res.data.map(s => `
            <option value="${s.id}">
              ${s.course?.courseName || 'Môn học'} | ${s.roomName} (${formatDateTime(s.startTime)} - ${formatTime(s.endTime)})
            </option>
          `).join('')}
        `;
      }
    }
  } catch (err) {
    console.error('Error loading class schedules:', err);
    showToast('Lỗi tải danh sách ca học', 'error');
  }
}

async function loadClassAttendanceData(scheduleId) {
  if (!scheduleId) return;
  try {
    const res = await fetch(`${API_BASE}/attendance/class/${scheduleId}`).then(r => r.json());
    const tbody = document.getElementById('class-attendance-tbody');
    if (res.success && res.data && tbody) {
      if (res.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Chưa có sinh viên nào điểm danh ca này</td></tr>`;
      } else {
        tbody.innerHTML = res.data.map((item, idx) => `
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

        // Cập nhật thông tin sinh viên vừa điểm danh gần nhất lên Result Box
        const latest = res.data[res.data.length - 1];
        const resultCard = document.getElementById('class-result-card');
        if (resultCard && latest) {
          resultCard.innerHTML = `
            <div class="result-title-bar">
              <div class="result-person-name">
                <span>👤</span><span>${latest.student?.fullName} (${latest.student?.studentCode})</span>
              </div>
              <span class="badge-tag ${latest.status === 'PRESENT' ? 'present' : 'late'}">
                ${latest.status === 'PRESENT' ? 'ĐÚNG GIỜ' : 'ĐI MUỘN'}
              </span>
            </div>
            <p style="font-size: 0.85rem; color: #334155; margin-bottom: 0;">
              Lớp: <strong>${latest.student?.className || '-'}</strong> | Điểm danh lúc: <strong>${formatDateTime(latest.checkInTime)}</strong>
            </p>
          `;
        }
      }
    }
  } catch (err) {
    console.error('Error fetching class attendance log:', err);
  }
}

function startClassPolling() {
  if (classAttendanceState.pollingInterval) clearInterval(classAttendanceState.pollingInterval);
  classAttendanceState.pollingInterval = setInterval(() => {
    if (classAttendanceState.selectedScheduleId) {
      loadClassAttendanceData(classAttendanceState.selectedScheduleId);
    }
  }, 3000);
}

window.launchDesktopOpenCV = async function() {
  if (!classAttendanceState.selectedScheduleId) {
    showToast('Vui lòng chọn Ca học / Môn học trước khi bật Camera', 'warning');
    return;
  }

  showToast('Đang kích hoạt Camera Python (OpenCV) trên màn hình...', 'info');
  try {
    const response = await fetch(`${API_BASE}/attendance/launch-desktop-scan?scheduleId=${classAttendanceState.selectedScheduleId}`, {
      method: 'POST'
    });
    const result = await response.json();
    if (result.success) {
      showToast('🚀 ' + (result.message || 'Khởi chạy OpenCV Desktop thành công!'), 'success');
    } else {
      showToast('Không thể mở OpenCV Desktop: ' + result.message, 'error');
    }
  } catch (err) {
    showToast('Lỗi gửi yêu cầu mở OpenCV: ' + err.message, 'error');
  }
};

window.quickRegisterFace = async function() {
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
      showToast('🚀 ' + (result.message || 'Cửa sổ đăng ký khuôn mặt đã mở trên desktop.'), 'success');
    } else {
      showToast('Lỗi: ' + result.message, 'error');
    }
  } catch (err) {
    showToast('Không thể gọi API đăng ký: ' + err.message, 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadClassSchedules();

  const select = document.getElementById('class-schedule-select');
  if (select) {
    select.addEventListener('change', (e) => {
      const val = e.target.value;
      classAttendanceState.selectedScheduleId = val || null;
      if (val) {
        loadClassAttendanceData(val);
        startClassPolling();
      } else {
        if (classAttendanceState.pollingInterval) clearInterval(classAttendanceState.pollingInterval);
        const tbody = document.getElementById('class-attendance-tbody');
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Chọn ca học để xem dữ liệu điểm danh</td></tr>`;
        }
      }
    });
  }

  const btnLaunch = document.getElementById('btn-launch-desktop');
  if (btnLaunch) {
    btnLaunch.addEventListener('click', window.launchDesktopOpenCV);
  }

  const btnReg = document.getElementById('btn-quick-register');
  if (btnReg) {
    btnReg.addEventListener('click', window.quickRegisterFace);
  }
});
