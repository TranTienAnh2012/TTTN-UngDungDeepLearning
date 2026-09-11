package com.attendance.service;

import com.attendance.dto.CheckInResultDTO;
import com.attendance.dto.ClassCheckInRequest;
import com.attendance.model.ClassAttendance;
import com.attendance.model.ClassSchedule;
import com.attendance.model.Student;
import com.attendance.repository.ClassAttendanceRepository;
import com.attendance.repository.ClassScheduleRepository;
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
public class ClassAttendanceService {

    private final StudentRepository studentRepository;
    private final ClassScheduleRepository classScheduleRepository;
    private final ClassAttendanceRepository classAttendanceRepository;
    private final StudentService studentService;
    private final AiClientService aiClientService;

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
                    .message(msg)
                    .bbox(bbox)
                    .build();
        }

        Student student = studentRepository.findByStudentCode(studentCode)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy sinh viên mã: " + studentCode));

        Optional<ClassAttendance> existing = classAttendanceRepository.findByScheduleIdAndStudentId(schedule.getId(), student.getId());
        if (existing.isPresent()) {
            ClassAttendance att = existing.get();
            return CheckInResultDTO.builder()
                    .success(true)
                    .studentCode(student.getStudentCode())
                    .fullName(student.getFullName())
                    .className(student.getClassName())
                    .courseName(schedule.getCourse() != null ? schedule.getCourse().getCourseName() : "")
                    .roomName(schedule.getRoomName())
                    .checkInTime(att.getCheckInTime())
                    .status("ALREADY_CHECKED_IN")
                    .confidenceScore(confidence)
                    .bbox(bbox)
                    .message("Sinh viên " + student.getFullName() + " (" + student.getStudentCode() + ") đã được điểm danh trước đó.")
                    .build();
        }

        LocalDateTime now = LocalDateTime.now();
        String status = "PRESENT";
        if (schedule.getStartTime() != null && now.isAfter(schedule.getStartTime().plusMinutes(15))) {
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

        String message = status.equals("PRESENT")
                ? "Điểm danh THÀNH CÔNG (Đúng giờ) cho sinh viên " + student.getFullName() + "!"
                : "Điểm danh THÀNH CÔNG (ĐI MUỘN) cho sinh viên " + student.getFullName() + "!";

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
                .message(message)
                .build();
    }

    public List<ClassAttendance> getClassAttendanceList(Long scheduleId) {
        return classAttendanceRepository.findByScheduleIdOrderByCheckInTimeDesc(scheduleId);
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
