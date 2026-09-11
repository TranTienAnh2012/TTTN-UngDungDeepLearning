/**
 * SCHEDULES MODULE
 * Quản lý tra cứu danh mục môn học, lịch học trong tuần và lịch thi (Không sử dụng Camera / AI giúp tiết kiệm 100% tài nguyên)
 */

async function loadSchedulesData() {
  try {
    const [resCourses, resClass, resExam] = await Promise.all([
      fetch(`${API_BASE}/schedules/courses`).then(r => r.json()),
      fetch(`${API_BASE}/schedules/class`).then(r => r.json()),
      fetch(`${API_BASE}/schedules/exam`).then(r => r.json())
    ]);

    // Render Courses
    const coursesTbody = document.getElementById('manage-courses-tbody');
    if (coursesTbody && resCourses.success && resCourses.data) {
      coursesTbody.innerHTML = resCourses.data.length === 0
        ? `<tr><td colspan="2" style="text-align:center; color:var(--text-muted);">Chưa có môn học nào</td></tr>`
        : resCourses.data.map(c => `
          <tr>
            <td><strong>${c.courseCode}</strong></td>
            <td>${c.courseName}</td>
          </tr>
        `).join('');
    }

    // Render Class Schedules
    const classTbody = document.getElementById('manage-class-tbody');
    if (classTbody && resClass.success && resClass.data) {
      classTbody.innerHTML = resClass.data.length === 0
        ? `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Chưa có lịch học nào</td></tr>`
        : resClass.data.map(s => `
          <tr>
            <td><strong>${s.course?.courseName || '-'}</strong></td>
            <td>${s.roomName}</td>
            <td>${formatDateTime(s.startTime)}</td>
            <td>${formatDateTime(s.endTime)}</td>
          </tr>
        `).join('');
    }

    // Render Exam Schedules
    const examTbody = document.getElementById('manage-exam-tbody');
    if (examTbody && resExam.success && resExam.data) {
      examTbody.innerHTML = resExam.data.length === 0
        ? `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Chưa có lịch thi nào</td></tr>`
        : resExam.data.map(e => `
          <tr>
            <td><strong>${e.course?.courseName || '-'}</strong></td>
            <td>${e.examRoom}</td>
            <td>${formatDateTime(e.examTime)}</td>
          </tr>
        `).join('');
    }
  } catch (err) {
    console.error('Error loading schedules data:', err);
    showToast('Lỗi tải dữ liệu lịch học / lịch thi', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSchedulesData();
});
