# Hệ Thống Điểm Danh & Xác Thực Phòng Thi Bằng Khuôn Mặt (AI Face Recognition & WebSocket STOMP)

Dự án phát triển hệ thống điểm danh sinh viên và kiểm soát điều kiện dự thi tự động bằng trí tuệ nhân tạo (Deep Learning Face Recognition), tích hợp **Spring Boot (Java)**, **OpenCV (Python)**, **WebSocket STOMP**, **InsightFace / FaceNet**, **MySQL** và giao diện Web thời gian thực.

---

## 🌟 Tính Năng Nổi Bật

1. **Truyền Luồng Trực Tiếp Qua WebSocket STOMP (Headless Video Streaming)**:
   - Module quét camera OpenCV hoạt động dạng headless, không mở cửa sổ pop-up desktop rời rạc (`cv2.imshow`).
   - Mã hóa khung hình JPEG Base64 và đẩy theo thời gian thực tới Spring Boot Message Broker qua WebSocket STOMP endpoint `/ws-attendance` (kênh `/topic/camera-stream`).
   - Giao diện Web hiển thị trực tiếp luồng camera HD mượt mà cùng trạng thái kết nối (`Connected`, FPS, độ trễ).

2. **Giao Diện HUD Face ID Hiện Đại (4 Góc Bo Tròn)**:
   - Thay thế khung chữ nhật bao quanh toàn mặt bằng **4 góc HUD tinh gọn (Corner Brackets)** phong cách nhận diện Face ID / Apple Vision.
   - Thẻ thông tin kính mờ (Glassmorphic Badge) hiển thị: Trạng thái nhận diện (Đã nhận diện / Đang nhận diện / Giả mạo), Mã SV, Họ tên, Độ chính xác (Confidence Score), Hành động chớp mắt/Liveness (Thẳng, Trái, Phải).

3. **Hỗ Trợ Tiếng Việt Unicode Hoàn Chỉnh**:
   - Tích hợp bộ vẽ chữ `PIL.ImageDraw` với font hệ thống Windows (`Segoe UI Bold` / `Arial Bold`).
   - Khắc phục hoàn toàn lỗi font ASCII/dấu hỏi (`???`) khi hiển thị họ tên tiếng Việt có dấu (ví dụ: *Nguyễn Cường Tường*, *Trần Tiến Anh*).

4. **Đăng Ký & Điểm Danh Sinh Viên Thông Minh**:
   - **Điểm danh lớp học**: Tự động so khớp khuôn mặt, phân loại `ĐÚNG GIỜ` hoặc `ĐI MUỘN` (sau 15 phút đầu giờ).
   - **Xác thực phòng thi**: Kiểm tra điều kiện dự thi theo thời gian thực, cảnh báo tức thì `CẤM THI` nếu sinh viên nghỉ quá số buổi quy định.
   - **Đăng ký khuôn mặt (Enrollment)**: Hỗ trợ tự động đếm ngược chụp lưu mẫu 512-dim embedding hoặc chụp trực tiếp từ webcam/tải ảnh lên.

---

## 🏛️ Kiến Trúc Hệ Thống

```
+-----------------------------------------------------------------------------------+
|                                  WEB FRONTEND                                     |
|  - HTML5, Vanilla CSS, JS (SockJS + STOMP.js)                                     |
|  - Điểm danh Lớp học | Xác thực Phòng thi | Quản lý SV & Đăng ký Face ID         |
|  - Đăng ký nhận luồng từ /topic/camera-stream & /topic/attendance-events          |
+--------------------------+-------------------------------------+------------------+
                           |                                     ^
                           | HTTP REST (Port 8080)               | WebSocket STOMP
                           v                                     |
+----------------------------------------------------------------+------------------+
|                           CORE BACKEND (Spring Boot :8080)                        |
|  - Spring Web, Spring WebSocket (STOMP Message Broker @ /ws-attendance)           |
|  - Quản lý Sinh viên, Lớp học, Lịch thi, Điều kiện dự thi (JPA / Hibernate)       |
|  - CameraStreamController / CameraStreamService phân phối stream & event          |
+--------------------------+-------------------------------------+------------------+
                           |                                     ^
                           | REST API (:5000)                    | WebSocket Client
                           v                                     | (stomp.py)
+------------------------------------+   +-----------------------+------------------+
|      AI SERVICE (Flask :5000)      |   |        OPENCV SCANNER / DESKTOP          |
|  - MTCNN / RetinaFace Phát hiện    |   |  - OpenCV Camera Capture                 |
|  - InceptionResnetV1 / FaceNet     |   |  - Liveness Detection & Face Matching    |
|  - Trích xuất 512-dim Vector       |   |  - Unicode HUD (Segoe UI) + 4-Corner     |
|  - Cosine Similarity Matching      |   |  - STOMP Streamer (main.py / enroll.py)  |
+-----------------+------------------+   +------------------------------------------+
                  |
                  v
+------------------------------------+
|       MYSQL DATABASE (:3306)       |
|  - Database: `face_attendance_db`  |
+------------------------------------+
```

---

## 📁 Cấu Trúc Dự Án

```
TTTN-UngDungDeepLerning/
│
├── OPENCV-SCAN/                  # Module quét camera độc lập kết nối STOMP
│   ├── main.py                   # Luồng quét điểm danh & đẩy stream lên Web
│   ├── enroll.py                 # Luồng đăng ký khuôn mặt trực tiếp qua camera
│   ├── run.bat                   # Script khởi chạy nhanh module quét
│   └── face_data/                # Thư mục chứa vector khuôn mặt (.npy)
│
├── TTTN/
│   ├── ai_service/               # Python Flask AI Recognition Microservice
│   │   ├── app.py                # FastAPI/Flask endpoints (/recognize, /register)
│   │   ├── requirements.txt      # Thư viện: torch, torchvision, facenet-pytorch...
│   │   └── dataset/              # Dữ liệu ảnh khuôn mặt tham chiếu
│   │
│   ├── backend/                  # Spring Boot REST API & WebSocket Broker
│   │   ├── pom.xml               # Cấu hình Maven & dependencies
│   │   └── src/main/java/com/attendance/
│   │       ├── config/           # WebSocketConfig (STOMP), WebConfig
│   │       ├── controller/       # CameraStreamController, AttendanceController...
│   │       ├── dto/              # CameraStreamFrameDTO, AttendanceEventDTO...
│   │       ├── model/            # Student, ClassSchedule, ExamSchedule...
│   │       ├── repository/       # Spring Data JPA Repositories
│   │       └── service/          # CameraStreamService, AttendanceService...
│   │
│   ├── frontend/                 # Giao diện Web Client
│   │   ├── index.html            # Trang chủ & Điểm danh lớp học
│   │   ├── exam-verification.html# Trang Xác thực phòng thi & Kiểm tra cấm thi
│   │   ├── admin.html            # Trang Quản trị viên & Đăng ký sinh viên
│   │   ├── schedules.html        # Trang Tra cứu lịch học & lịch thi
│   │   ├── css/style.css         # Bộ giao diện Glassmorphism hiện đại
│   │   └── js/                   # home-dashboard.js, exam-verification.js, stomp...
│   │
│   ├── database/                 # Script cơ sở dữ liệu MySQL
│   │   ├── seed_data.sql         # Dữ liệu mẫu sinh viên & lịch thi
│   │   └── update_schema.sql     # Schema cơ sở dữ liệu
│   │
│   └── opencv_desktop/           # Bộ mã nguồn OpenCV client dự phòng
│
├── START_FULL_SYSTEM.bat         # Script 1-Click khởi động toàn bộ hệ thống
├── RUN_OPENCV_SCAN.bat           # Script 1-Click chạy luồng quét camera
└── README.md                     # Tài liệu hướng dẫn dự án
```

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Yêu Cầu Môi Trường
- **Java**: JDK 17+ (Microsoft OpenJDK / Oracle JDK)
- **Maven**: 3.8+
- **Python**: 3.10+
- **MySQL Server**: 8.0+ (Cổng mặc định `3306`)

### 2. Cài Đặt Cơ Sở Dữ Liệu
Tạo cơ sở dữ liệu và nạp dữ liệu mẫu:
```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS face_attendance_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
Get-Content TTTN/database/seed_data.sql | mysql -u root -p face_attendance_db
```

### 3. Cài Đặt Thư Viện Python
```powershell
pip install -r TTTN/ai_service/requirements.txt
pip install opencv-python pillow stomp.py numpy requests
```

### 4. Khởi Chạy Hệ Thống
Chạy file tự động khởi động:
```powershell
.\START_FULL_SYSTEM.bat
```
Hoặc khởi chạy từng thành phần:
- **AI Service (Port 5000)**: `python TTTN/ai_service/app.py`
- **Spring Boot Backend (Port 8080)**: `cd TTTN/backend && mvn spring-boot:run`
- **Camera Scanner**: `python OPENCV-SCAN/main.py`

Truy cập hệ thống tại: `http://localhost:8080`

---

## 📡 WebSocket STOMP Topics Reference

| Topic | Mục đích | Payload |
|---|---|---|
| `/topic/camera-stream` | Luồng khung hình video Base64 từ OpenCV | `{"base64Image": "...", "mode": "ATTENDANCE", "fps": 28.5}` |
| `/topic/attendance-events` | Sự kiện điểm danh / xác thực thi | `{"studentCode": "SV001", "studentName": "...", "status": "PRESENT"}` |
| `/topic/registration-events`| Sự kiện đăng ký khuôn mặt | `{"studentCode": "SV002", "status": "COMPLETED"}` |
| `/topic/camera-status` | Trạng thái bật/tắt của camera scanner | `{"status": "RUNNING", "cameraType": "OPENCV_HEADLESS"}` |

---

## 👥 Tác Giả & Bản Quyền
- Dự án Thực tập Tốt nghiệp - Ứng dụng Deep Learning trong Nhận diện Khuôn mặt & Điểm danh Thông minh.
- Repository: [TranTienAnh2012/TTTN-UngDungDeepLearning](https://github.com/TranTienAnh2012/TTTN-UngDungDeepLearning.git)