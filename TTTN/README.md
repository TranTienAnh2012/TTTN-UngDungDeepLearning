# Hệ Thống Điểm Danh & Xác Thực Phòng Thi Bằng Khuôn Mặt (Java & Python)

Hệ thống điểm danh sinh viên và xác thực điều kiện dự thi bằng nhận diện khuôn mặt thời gian thực sử dụng **Java Spring Boot**, **Python Flask (MTCNN & FaceNet VGGFace2)**, **MySQL** và **WebRTC Client**.

---

## 🏛️ Kiến Trúc Hệ Thống

```
+-------------------------------------------------------------+
|                      WEB CLIENT UI                          |
|  - Camera WebRTC trực tiếp trên trình duyệt                 |
|  - Giao diện Điểm danh lớp / Xác thực thi / Quản lý SV      |
+------------------------------+------------------------------+
                               | HTTP JSON (Base64 JPEG)
                               v
+-------------------------------------------------------------+
|               CORE BACKEND (Spring Boot - Port 8080)        |
|  - Quản lý Sinh viên, Lớp học, Môn học, Lịch thi            |
|  - Nghiệp vụ Điểm danh (Đúng giờ / Muộn) & Cấm thi          |
|  - REST Client giao tiếp với Python AI Service              |
+---------------+-----------------------------+---------------+
                |                             |
                | Gửi Base64 + Candidates     | JPA / Hibernate
                v                             v
+-------------------------------+   +-------------------------+
|   AI SERVICE (Flask :5000)    |   |     MYSQL DATABASE      |
| - MTCNN: Phát hiện khuôn mặt  |   |   `face_attendance_db`  |
| - InceptionResnet: Embedding  |   | (Students, Schedules,   |
| - Cosine Similarity so khớp   |   |  Attendance, Eligibility|
+-------------------------------+   +-------------------------+
```

---

## 🚀 Hướng Dẫn Khởi Chạy Hệ Thống

### 1. Cơ sở dữ liệu MySQL
- Đảm bảo MySQL đang chạy (XAMPP / MySQL Service) trên cổng `3306`.
- Tên database: `face_attendance_db` (User: `root`, Password: `123456`).
- Script nạp dữ liệu mẫu ban đầu:
  ```powershell
  Get-Content database/seed_data.sql | & "C:\xampp\mysql\bin\mysql.exe" --default-character-set=utf8mb4 -u root -p123456
  ```

### 2. Khởi chạy AI Service (Python Flask)
- Di chuyển vào thư mục `ai_service`:
  ```powershell
  cd d:\TTTN\ai_service
  & "C:\Users\admin\AppData\Local\Programs\Python\Python310\python.exe" app.py
  ```
- Dịch vụ AI sẽ chạy tại: `http://localhost:5000` (Endpoint health check: `http://localhost:5000/api/ai/health`).

### 3. Khởi chạy Backend Core (Spring Boot)
- Di chuyển vào thư mục `backend`:
  ```powershell
  cd d:\TTTN\backend
  $env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
  & "C:\Users\admin\.m2\wrapper\dists\apache-maven-3.9.16\0daed3be3ebd1c706f0e69e8b07c6b73f5cc4ea3dfce72a8d0ec2e849ca2ddb0\bin\mvn.cmd" spring-boot:run
  ```
- Backend Core và Web App sẽ chạy tại: `http://localhost:8080`.

---

## 📌 Các Tính Năng Chính Trên Giao Diện Web

1. **📸 Điểm danh Lớp học (Class Attendance)**:
   - Tự động mở luồng camera WebRTC từ trình duyệt.
   - Chọn ca học / môn học tương ứng.
   - Hỗ trợ chế độ **"Chụp & Điểm danh ngay"** hoặc **"Tự động quét (Auto-scan)"** mỗi 3 giây.
   - Tự động ghi nhận sinh viên, phân loại trạng thái: `ĐÚNG GIỜ` hoặc `ĐI MUỘN` (sau 15 phút đầu giờ).
   - Hiển thị danh sách điểm danh lớp học theo thời gian thực.

2. **🎓 Xác thực Phòng thi (Exam Verification)**:
   - Chọn ca thi / phòng thi.
   - Quét khuôn mặt thí sinh -> Kiểm tra danh sách điều kiện dự thi (`exam_eligibility`):
     - 🟢 **HỢP LỆ**: Cho phép thí sinh vào phòng thi và ghi nhận `is_verified = true`.
     - 🔴 **BỊ CẤM THI**: Cảnh báo tức thì nếu sinh viên nghỉ quá số buổi hoặc vi phạm điều kiện dự thi.

3. **👤 Quản lý Sinh viên & Đăng ký Face ID**:
   - Quản lý danh sách sinh viên lớp `K23CNT3`.
   - Tìm kiếm nhanh theo mã sinh viên, họ tên hoặc lớp.
   - Bấm **"Đăng ký khuôn mặt"**: Mở Modal chụp trực tiếp từ camera hoặc tải ảnh chân dung lên để trích xuất và lưu vector 512 chiều vào MySQL.

4. **📅 Lịch học & Lịch thi (Schedules)**:
   - Theo dõi danh mục môn học, lịch học các ca trong ngày và lịch thi tại các phòng thi.

---

## 🔗 Danh Sách REST APIs

### AI Service (Flask :5000)
- `GET  /api/ai/health`: Kiểm tra trạng thái AI Engine & Device (CPU/GPU).
- `POST /api/ai/register`: Nhận ảnh Base64 -> trả về mảng vector đặc trưng khuôn mặt (512 chiều).
- `POST /api/ai/recognize`: Nhận ảnh Base64 + danh sách candidate embeddings -> so khớp Cosine Similarity.

### Backend Core (Spring Boot :8080)
- `GET    /api/students`: Lấy danh sách toàn bộ sinh viên kèm trạng thái Face ID.
- `GET    /api/students/{code}`: Lấy thông tin sinh viên theo mã SV.
- `POST   /api/students`: Tạo mới sinh viên.
- `POST   /api/students/register-face`: Đăng ký khuôn mặt sinh viên qua ảnh Base64.
- `GET    /api/schedules/class`: Lấy danh sách lịch học.
- `GET    /api/schedules/exam`: Lấy danh sách lịch thi.
- `POST   /api/attendance/class/check-in`: Gửi ảnh khuôn mặt điểm danh ca học.
- `POST   /api/attendance/exam/check-in`: Gửi ảnh khuôn mặt xác thực phòng thi.
- `GET    /api/attendance/class/{scheduleId}`: Xem lịch sử điểm danh ca học.
- `GET    /api/attendance/exam/{examScheduleId}`: Xem danh sách thí sinh đã vào phòng thi.
