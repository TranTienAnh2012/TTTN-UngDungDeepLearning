package com.attendance.service;

import com.attendance.dto.CheckInResultDTO;
import com.attendance.dto.ClassCheckInRequest;
import com.attendance.dto.ExamCheckInRequest;
import com.attendance.dto.ExamCheckInResultDTO;
import com.attendance.model.*;
import com.attendance.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AttendanceService {

    private final StudentRepository studentRepository;
    private final ClassScheduleRepository classScheduleRepository;
    private final ClassAttendanceRepository classAttendanceRepository;
    private final ExamScheduleRepository examScheduleRepository;
    private final ExamEligibilityRepository examEligibilityRepository;
    private final ExamAttendanceRepository examAttendanceRepository;
    private final StudentService studentService;
    private final AiClientService aiClientService;

    /**
     * Điểm danh Lớp học
     */
    @Transactional
    public CheckInResultDTO checkInClass(ClassCheckInRequest request) {
        ClassSchedule schedule = classScheduleRepository.findById(request.getScheduleId())
                .orElseThrow(() -> new RuntimeException("Không tìm thấy ca học ID: " + request.getScheduleId()));

        List<Map<String, Object>> candidates = studentService.getCandidatesForRecognition();
        if (candidates.isEmpty()) {
            return CheckInResultDTO.builder()
                    .success(false)
                    .status("NO_REGISTERED_STUDENTS")
                    .message("Chưa có sinh viên nào đăng ký khuôn mặt trong hệ thống.")
                    .build();
        }

        Map<String, Object> aiResult = aiClientService.recognizeFace(request.getImage(), candidates, null);
        Boolean matched = (Boolean) aiResult.get("matched");
        String studentCode = (String) aiResult.get("student_code");
        Number confNum = (Number) aiResult.get("confidence");
        Float confidence = confNum != null ? confNum.floatValue() : 0.0f;
        
        List<Integer> bbox = parseBbox(aiResult);

        if (!Boolean.TRUE.equals(matched) || studentCode == null) {
            String msg = (String) aiResult.getOrDefault("message", "Khuôn mặt không khớp với bất kỳ sinh viên nào.");
            return CheckInResultDTO.builder()
                    .success(false)
                    .status("NOT_FOUND")
                    .confidenceScore(confidence)
                    .bbox(bbox)
                    .message(msg)
                    .build();
        }

        Student student = studentRepository.findByStudentCode(studentCode)
                .orElseThrow(() -> new RuntimeException("Lỗi dữ liệu: Không tìm thấy sinh viên " + studentCode));

        // Kiểm tra xem sinh viên đã điểm danh ca này chưa
        Optional<ClassAttendance> existingAttendance = classAttendanceRepository.findByScheduleIdAndStudentId(schedule.getId(), student.getId());
        LocalDateTime now = LocalDateTime.now();

        if (existingAttendance.isPresent()) {
            ClassAttendance existing = existingAttendance.get();
            return CheckInResultDTO.builder()
                    .success(true)
                    .studentCode(student.getStudentCode())
                    .fullName(student.getFullName())
                    .className(student.getClassName())
                    .courseName(schedule.getCourse() != null ? schedule.getCourse().getCourseName() : "")
                    .roomName(schedule.getRoomName())
                    .checkInTime(existing.getCheckInTime())
                    .status("ALREADY_CHECKED_IN")
                    .confidenceScore(existing.getConfidenceScore())
                    .bbox(bbox)
                    .message("Sinh viên " + student.getFullName() + " đã được điểm danh trước đó lúc " + existing.getCheckInTime().toLocalTime().withNano(0))
                    .build();
        }

        // Đánh giá đúng giờ / đi muộn (ví dụ: sau giờ bắt đầu 15 phút tính là muộn)
        String status = "PRESENT";
        if (now.isAfter(schedule.getStartTime().plusMinutes(15))) {
            status = "LATE";
        }

        ClassAttendance attendance = ClassAttendance.builder()
                .student(student)
                .schedule(schedule)
                .checkInTime(now)
                .status(status)
                .confidenceScore(confidence)
                .build();

        classAttendanceRepository.save(attendance);

        return CheckInResultDTO.builder()
                .success(true)
                .studentCode(student.getStudentCode())
                .fullName(student.getFullName())
                .className(student.getClassName())
                .courseName(schedule.getCourse() != null ? schedule.getCourse().getCourseName() : "")
                .roomName(schedule.getRoomName())
                .checkInTime(now)
                .status(status)
                .confidenceScore(confidence)
                .bbox(bbox)
                .message("Điểm danh thành công: " + student.getFullName() + " (" + (status.equals("PRESENT") ? "Đúng giờ" : "Đi muộn") + ")")
                .build();
    }

    /**
     * Xác thực Phòng thi
     */
    @Transactional
    public ExamCheckInResultDTO checkInExam(ExamCheckInRequest request) {
        ExamSchedule examSchedule = examScheduleRepository.findById(request.getExamScheduleId())
                .orElseThrow(() -> new RuntimeException("Không tìm thấy ca thi ID: " + request.getExamScheduleId()));

        List<Map<String, Object>> candidates = studentService.getCandidatesForRecognition();
        if (candidates.isEmpty()) {
            return ExamCheckInResultDTO.builder()
                    .verified(false)
                    .eligible(false)
                    .decision("NOT_FOUND")
                    .message("Hệ thống chưa có dữ liệu khuôn mặt để nhận diện.")
                    .build();
        }

        Map<String, Object> aiResult = aiClientService.recognizeFace(request.getImage(), candidates, null);
        Boolean matched = (Boolean) aiResult.get("matched");
        String studentCode = (String) aiResult.get("student_code");
        Number confNum = (Number) aiResult.get("confidence");
        Float confidence = confNum != null ? confNum.floatValue() : 0.0f;
        List<Integer> bbox = parseBbox(aiResult);

        if (!Boolean.TRUE.equals(matched) || studentCode == null) {
            String msg = (String) aiResult.getOrDefault("message", "Không nhận diện được khuôn mặt thí sinh.");
            return ExamCheckInResultDTO.builder()
                    .verified(false)
                    .eligible(false)
                    .confidenceScore(confidence)
                    .bbox(bbox)
                    .decision("NOT_FOUND")
                    .message(msg)
                    .build();
        }

        Student student = studentRepository.findByStudentCode(studentCode)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy thông tin sinh viên " + studentCode));

        LocalDateTime now = LocalDateTime.now();

        // Kiểm tra điều kiện dự thi (Exam Eligibility)
        Optional<ExamEligibility> eligibilityOpt = examEligibilityRepository.findByExamScheduleIdAndStudentId(examSchedule.getId(), student.getId());
        
        boolean isEligible = eligibilityOpt.map(ExamEligibility::getIsEligible).orElse(false);

        if (!isEligible) {
            // Thí sinh bị CẤM THI hoặc không có trong danh sách thi
            return ExamCheckInResultDTO.builder()
                    .verified(false)
                    .eligible(false)
                    .studentCode(student.getStudentCode())
                    .fullName(student.getFullName())
                    .className(student.getClassName())
                    .courseName(examSchedule.getCourse() != null ? examSchedule.getCourse().getCourseName() : "")
                    .examRoom(examSchedule.getExamRoom())
                    .examTime(examSchedule.getExamTime())
                    .checkInTime(now)
                    .confidenceScore(confidence)
                    .bbox(bbox)
                    .decision("DENIED")
                    .message("⛔ CẢNH BÁO: Thí sinh " + student.getFullName() + " (MSV: " + student.getStudentCode() + ") BỊ CẤM THI môn học này!")
                    .build();
        }

        // Thí sinh ĐỦ ĐIỀU KIỆN THI -> Ghi nhận vào exam_attendance
        Integer assignedRow = null;
        Integer assignedCol = null;
        String successMessage = "✅ HỢP LỆ: Thí sinh " + student.getFullName() + " đủ điều kiện và được phép vào phòng thi!";

        Optional<ExamAttendance> existingAttendance = examAttendanceRepository.findByExamScheduleIdAndStudentId(examSchedule.getId(), student.getId());
        if (existingAttendance.isPresent()) {
            ExamAttendance existing = existingAttendance.get();
            assignedRow = existing.getSeatRow();
            assignedCol = existing.getSeatCol();
            successMessage = "ℹ️ ĐÃ XÁC THỰC: Thí sinh " + student.getFullName() + " đã điểm danh phòng thi này trước đó.";
        } else {
            // Sử dụng chỗ ngồi xếp sẵn nếu có
            Integer preRow = eligibilityOpt.map(ExamEligibility::getSeatRow).orElse(null);
            Integer preCol = eligibilityOpt.map(ExamEligibility::getSeatCol).orElse(null);
            
            if (preRow != null && preCol != null) {
                assignedRow = preRow;
                assignedCol = preCol;
            } else {
                // Tìm vị trí ghế trống tự động (fallback)
                int rows = examSchedule.getSeatingRows() != null ? examSchedule.getSeatingRows() : 5;
                int cols = examSchedule.getSeatingCols() != null ? examSchedule.getSeatingCols() : 5;
                String disabledSeatsStr = examSchedule.getDisabledSeats(); // ví dụ: ["0-1", "1-2"]
                
                // Lấy danh sách các ghế đã bị ngồi
                List<ExamAttendance> currentAttendance = examAttendanceRepository.findByExamScheduleIdOrderByCheckInTimeDesc(examSchedule.getId());
                
                // Tìm vị trí trống
                boolean foundSeat = false;
                for (int r = 0; r < rows; r++) {
                    for (int c = 0; c < cols; c++) {
                        String seatCoord = r + "-" + c;
                        
                        // Kiểm tra xem ghế có bị hỏng không
                        if (disabledSeatsStr != null && (disabledSeatsStr.contains("\"" + seatCoord + "\"") || disabledSeatsStr.contains("'" + seatCoord + "'"))) {
                            continue;
                        }
                        
                        // Kiểm tra xem ghế đã có người ngồi chưa
                        final int finalR = r;
                        final int finalC = c;
                        boolean isOccupied = currentAttendance.stream()
                                .anyMatch(att -> att.getSeatRow() != null && att.getSeatCol() != null 
                                        && att.getSeatRow() == finalR && att.getSeatCol() == finalC);
                        if (isOccupied) {
                            continue;
                        }
                        
                        // Đã tìm thấy ghế trống
                        assignedRow = r;
                        assignedCol = c;
                        foundSeat = true;
                        break;
                    }
                    if (foundSeat) {
                        break;
                    }
                }
                
                if (!foundSeat) {
                    return ExamCheckInResultDTO.builder()
                            .verified(false)
                            .eligible(true)
                            .studentCode(student.getStudentCode())
                            .fullName(student.getFullName())
                            .className(student.getClassName())
                            .courseName(examSchedule.getCourse() != null ? examSchedule.getCourse().getCourseName() : "")
                            .examRoom(examSchedule.getExamRoom())
                            .examTime(examSchedule.getExamTime())
                            .checkInTime(now)
                            .confidenceScore(confidence)
                            .bbox(bbox)
                            .decision("DENIED")
                            .message("⚠️ CẢNH BÁO: Phòng thi đã hết chỗ ngồi trống!")
                            .build();
                }
            }
            
            ExamAttendance examAttendance = ExamAttendance.builder()
                    .student(student)
                    .examSchedule(examSchedule)
                    .checkInTime(now)
                    .isVerified(true)
                    .seatRow(assignedRow)
                    .seatCol(assignedCol)
                    .build();
            examAttendanceRepository.save(examAttendance);
        }

        return ExamCheckInResultDTO.builder()
                .verified(true)
                .eligible(true)
                .studentCode(student.getStudentCode())
                .fullName(student.getFullName())
                .className(student.getClassName())
                .courseName(examSchedule.getCourse() != null ? examSchedule.getCourse().getCourseName() : "")
                .examRoom(examSchedule.getExamRoom())
                .examTime(examSchedule.getExamTime())
                .checkInTime(now)
                .confidenceScore(confidence)
                .bbox(bbox)
                .decision("ALLOWED")
                .message(successMessage)
                .seatRow(assignedRow)
                .seatCol(assignedCol)
                .build();
    }

    public List<ClassAttendance> getClassAttendanceList(Long scheduleId) {
        return classAttendanceRepository.findByScheduleIdOrderByCheckInTimeDesc(scheduleId);
    }

    public List<ExamAttendance> getExamAttendanceList(Long examScheduleId) {
        return examAttendanceRepository.findByExamScheduleIdOrderByCheckInTimeDesc(examScheduleId);
    }

    private List<Integer> parseBbox(Map<String, Object> aiResult) {
        if (aiResult != null && aiResult.containsKey("bbox") && aiResult.get("bbox") instanceof List) {
            List<?> rawList = (List<?>) aiResult.get("bbox");
            List<Integer> bbox = new java.util.ArrayList<>();
            for (Object item : rawList) {
                if (item instanceof Number) {
                    bbox.add(((Number) item).intValue());
                }
            }
            return bbox;
        }
        return null;
    }
}
