package com.attendance.service;

import com.attendance.dto.ExamCheckInRequest;
import com.attendance.dto.ExamCheckInResultDTO;
import com.attendance.model.ExamAttendance;
import com.attendance.model.ExamEligibility;
import com.attendance.model.ExamSchedule;
import com.attendance.model.Student;
import com.attendance.repository.ExamAttendanceRepository;
import com.attendance.repository.ExamEligibilityRepository;
import com.attendance.repository.ExamScheduleRepository;
import com.attendance.repository.StudentRepository;
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
public class ExamAttendanceService {

    private final StudentRepository studentRepository;
    private final ExamScheduleRepository examScheduleRepository;
    private final ExamEligibilityRepository examEligibilityRepository;
    private final ExamAttendanceRepository examAttendanceRepository;
    private final StudentService studentService;
    private final AiClientService aiClientService;

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
            return ExamCheckInResultDTO.builder()
                    .verified(false)
                    .eligible(false)
                    .decision("NOT_FOUND")
                    .message(msg)
                    .bbox(bbox)
                    .build();
        }

        Student student = studentRepository.findByStudentCode(studentCode)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy sinh viên mã: " + studentCode));

        Optional<ExamEligibility> eligibilityOpt = examEligibilityRepository.findByExamScheduleIdAndStudentId(examSchedule.getId(), student.getId());
        boolean isEligible = true;
        Integer assignedRow = null;
        Integer assignedCol = null;

        if (eligibilityOpt.isPresent()) {
            ExamEligibility eligibility = eligibilityOpt.get();
            isEligible = Boolean.TRUE.equals(eligibility.getIsEligible());
            assignedRow = eligibility.getSeatRow();
            assignedCol = eligibility.getSeatCol();
        }

        if (!isEligible) {
            return ExamCheckInResultDTO.builder()
                    .verified(false)
                    .eligible(false)
                    .studentCode(student.getStudentCode())
                    .fullName(student.getFullName())
                    .className(student.getClassName())
                    .courseName(examSchedule.getCourse() != null ? examSchedule.getCourse().getCourseName() : "")
                    .examRoom(examSchedule.getExamRoom())
                    .examTime(examSchedule.getExamTime())
                    .decision("DENIED")
                    .message("CẢNH BÁO: Thí sinh " + student.getFullName() + " (" + student.getStudentCode() + ") BỊ CẤM THI!")
                    .confidenceScore(confidence)
                    .bbox(bbox)
                    .build();
        }

        Optional<ExamAttendance> existing = examAttendanceRepository.findByExamScheduleIdAndStudentId(examSchedule.getId(), student.getId());
        if (existing.isPresent()) {
            ExamAttendance att = existing.get();
            return ExamCheckInResultDTO.builder()
                    .verified(true)
                    .eligible(true)
                    .studentCode(student.getStudentCode())
                    .fullName(student.getFullName())
                    .className(student.getClassName())
                    .courseName(examSchedule.getCourse() != null ? examSchedule.getCourse().getCourseName() : "")
                    .examRoom(examSchedule.getExamRoom())
                    .examTime(examSchedule.getExamTime())
                    .seatRow(att.getSeatRow())
                    .seatCol(att.getSeatCol())
                    .checkInTime(att.getCheckInTime())
                    .decision("ALLOWED")
                    .message("Thí sinh " + student.getFullName() + " đã được xác thực vào phòng thi trước đó.")
                    .confidenceScore(confidence)
                    .bbox(bbox)
                    .build();
        }

        int finalRow = (assignedRow != null) ? assignedRow : 0;
        int finalCol = (assignedCol != null) ? assignedCol : 0;

        LocalDateTime now = LocalDateTime.now();
        ExamAttendance attendance = ExamAttendance.builder()
                .student(student)
                .examSchedule(examSchedule)
                .checkInTime(now)
                .isVerified(true)
                .seatRow(finalRow)
                .seatCol(finalCol)
                .build();
        examAttendanceRepository.save(attendance);

        return ExamCheckInResultDTO.builder()
                .verified(true)
                .eligible(true)
                .studentCode(student.getStudentCode())
                .fullName(student.getFullName())
                .className(student.getClassName())
                .courseName(examSchedule.getCourse() != null ? examSchedule.getCourse().getCourseName() : "")
                .examRoom(examSchedule.getExamRoom())
                .examTime(examSchedule.getExamTime())
                .seatRow(finalRow)
                .seatCol(finalCol)
                .checkInTime(now)
                .decision("ALLOWED")
                .message("Xác thực THÀNH CÔNG! Thí sinh " + student.getFullName() + " được phép vào phòng thi.")
                .confidenceScore(confidence)
                .bbox(bbox)
                .build();
    }

    public List<ExamAttendance> getExamAttendanceList(Long examScheduleId) {
        return examAttendanceRepository.findByExamScheduleIdOrderByCheckInTimeDesc(examScheduleId);
    }

    @SuppressWarnings("unchecked")
    private List<Integer> parseBbox(Map<String, Object> aiResult) {
        try {
            Object boxObj = aiResult.get("bbox");
            if (boxObj instanceof List) {
                List<?> list = (List<?>) boxObj;
                return list.stream().map(o -> ((Number) o).intValue()).toList();
            }
        } catch (Exception ignored) {}
        return null;
    }
}
