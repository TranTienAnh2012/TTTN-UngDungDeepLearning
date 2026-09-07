-- Script nạp dữ liệu mẫu ban đầu cho face_attendance_db
USE face_attendance_db;

-- 1. Xóa dữ liệu cũ nếu có
DELETE FROM class_attendance;
DELETE FROM exam_attendance;
DELETE FROM exam_eligibility;
DELETE FROM class_schedules;
DELETE FROM exam_schedules;
DELETE FROM students;
DELETE FROM courses;

-- 2. Thêm danh sách môn học mẫu
INSERT INTO courses (id, course_code, course_name) VALUES
(1, 'IT301', 'Lập trình Java Nâng Cao'),
(2, 'AI201', 'Nhập môn Trí tuệ Nhân tạo'),
(3, 'DB101', 'Cơ sở Dữ liệu & Hệ quản trị CSDL');

-- 3. Thêm danh sách sinh viên mẫu lớp K23CNT3
INSERT INTO students (id, student_code, full_name, date_of_birth, class_name, face_embedding, status) VALUES
(1, '2310900051', 'Nguyễn Công Tùng', '2005-06-15', 'K23CNT3', NULL, 'ACTIVE'),
(2, '2310900012', 'Trần Bảo Long', '2005-02-20', 'K23CNT3', NULL, 'ACTIVE'),
(3, '2310900028', 'Lê Hoàng Yến', '2005-11-08', 'K23CNT3', NULL, 'ACTIVE'),
(4, '2310900035', 'Phạm Minh Đức', '2005-04-12', 'K23CNT3', NULL, 'ACTIVE'),
(5, '2310900049', 'Hoàng Thu Trang', '2005-09-25', 'K23CNT3', NULL, 'ACTIVE');

-- 4. Thêm Lịch học mẫu (Hôm nay & các ca học)
INSERT INTO class_schedules (id, course_id, room_name, start_time, end_time) VALUES
(1, 1, 'P.Lab 302', NOW() - INTERVAL 1 HOUR, NOW() + INTERVAL 2 HOUR),
(2, 2, 'P.Hội trường A2', NOW() + INTERVAL 3 HOUR, NOW() + INTERVAL 5 HOUR),
(3, 3, 'P.Lab 201', NOW() + INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY + INTERVAL 2 HOUR);

-- 5. Thêm Lịch thi mẫu
INSERT INTO exam_schedules (id, course_id, exam_room, exam_time) VALUES
(1, 1, 'Phòng thi 401 - Tòa B', NOW() + INTERVAL 2 HOUR),
(2, 2, 'Phòng thi 502 - Tòa A', NOW() + INTERVAL 2 DAY);

-- 6. Thêm Danh sách điều kiện dự thi (Exam Eligibility)
-- SV1, SV2, SV3, SV5 đủ điều kiện thi (is_eligible = 1)
-- SV4 bị cấm thi (is_eligible = 0) do nghỉ quá 20% số buổi học
INSERT INTO exam_eligibility (exam_schedule_id, student_id, is_eligible) VALUES
(1, 1, 1),
(1, 2, 1),
(1, 3, 1),
(1, 4, 0), -- Bị cấm thi môn Lập trình Java Nâng Cao
(1, 5, 1),
(2, 1, 1),
(2, 2, 1),
(2, 3, 1),
(2, 4, 1),
(2, 5, 1);
