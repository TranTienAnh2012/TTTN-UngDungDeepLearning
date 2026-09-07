-- Script cập nhật schema cho face_attendance_db
USE face_attendance_db;

-- 1. Tạo bảng quản trị viên (administrators)
CREATE TABLE IF NOT EXISTS administrators (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Thêm tài khoản quản trị mẫu nếu chưa có
INSERT INTO administrators (username, password, full_name)
SELECT 'admin', 'admin123', 'Quản trị viên Hệ thống'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM administrators WHERE username = 'admin');

-- 2. Thêm các cột cho sơ đồ phòng thi trong exam_schedules
ALTER TABLE exam_schedules
ADD COLUMN seating_rows INT DEFAULT 5,
ADD COLUMN seating_cols INT DEFAULT 5,
ADD COLUMN disabled_seats TEXT DEFAULT NULL;

-- 3. Thêm các cột cho ghế ngồi thí sinh trong exam_attendance
ALTER TABLE exam_attendance
ADD COLUMN seat_row INT DEFAULT NULL,
ADD COLUMN seat_col INT DEFAULT NULL;
