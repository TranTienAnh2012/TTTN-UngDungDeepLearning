-- Nâng cấp schema phiên bản 2: Bổ sung tọa độ ghế ngồi cho bảng điều kiện dự thi
USE face_attendance_db;

ALTER TABLE exam_eligibility
ADD COLUMN seat_row INT DEFAULT NULL,
ADD COLUMN seat_col INT DEFAULT NULL;
