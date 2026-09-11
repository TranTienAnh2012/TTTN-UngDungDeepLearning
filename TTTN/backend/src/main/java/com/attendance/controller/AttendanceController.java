package com.attendance.controller;

import com.attendance.dto.*;
import com.attendance.model.ClassAttendance;
import com.attendance.model.ExamAttendance;
import com.attendance.service.ClassAttendanceService;
import com.attendance.service.ExamAttendanceService;
import com.attendance.service.OpenCvDesktopService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/attendance")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AttendanceController {

    private final ClassAttendanceService classAttendanceService;
    private final ExamAttendanceService examAttendanceService;
    private final OpenCvDesktopService openCvDesktopService;

    @PostMapping("/class/check-in")
    public ResponseEntity<ApiResponse<CheckInResultDTO>> checkInClass(@RequestBody ClassCheckInRequest request) {
        if (request.getScheduleId() == null || request.getImage() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Thiếu scheduleId hoặc ảnh chụp khuôn mặt"));
        }
        CheckInResultDTO result = classAttendanceService.checkInClass(request);
        if (!result.isSuccess()) {
            return ResponseEntity.ok(ApiResponse.<CheckInResultDTO>builder().success(false).message(result.getMessage()).data(result).build());
        }
        return ResponseEntity.ok(ApiResponse.ok(result.getMessage(), result));
    }

    @PostMapping("/exam/check-in")
    public ResponseEntity<ApiResponse<ExamCheckInResultDTO>> checkInExam(@RequestBody ExamCheckInRequest request) {
        if (request.getExamScheduleId() == null || request.getImage() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Thiếu examScheduleId hoặc ảnh chụp khuôn mặt"));
        }
        ExamCheckInResultDTO result = examAttendanceService.checkInExam(request);
        if (!result.isVerified()) {
            return ResponseEntity.ok(ApiResponse.<ExamCheckInResultDTO>builder().success(false).message(result.getMessage()).data(result).build());
        }
        return ResponseEntity.ok(ApiResponse.ok(result.getMessage(), result));
    }

    @GetMapping("/class/{scheduleId}")
    public ResponseEntity<ApiResponse<List<ClassAttendance>>> getClassAttendanceList(@PathVariable Long scheduleId) {
        return ResponseEntity.ok(ApiResponse.ok(classAttendanceService.getClassAttendanceList(scheduleId)));
    }

    @GetMapping("/exam/{examScheduleId}")
    public ResponseEntity<ApiResponse<List<ExamAttendance>>> getExamAttendanceList(@PathVariable Long examScheduleId) {
        return ResponseEntity.ok(ApiResponse.ok(examAttendanceService.getExamAttendanceList(examScheduleId)));
    }

    @PostMapping("/launch-desktop-scan")
    public ResponseEntity<ApiResponse<String>> launchDesktopScan(@RequestParam(required = false) String scheduleId) {
        try {
            openCvDesktopService.launchDesktopScan(scheduleId);
            return ResponseEntity.ok(ApiResponse.ok("Đã kích hoạt cửa sổ OpenCV Desktop (60 FPS) thành công", "SUCCESS"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error("Không thể mở ứng dụng OpenCV Desktop: " + e.getMessage()));
        }
    }

    @PostMapping("/launch-register-scan")
    public ResponseEntity<ApiResponse<String>> launchRegisterScan(
            @RequestParam String studentCode,
            @RequestParam(required = false) String fullName,
            @RequestParam(required = false) String className) {
        try {
            openCvDesktopService.launchRegisterScan(studentCode, fullName, className);
            return ResponseEntity.ok(ApiResponse.ok("Đã mở cửa sổ đăng ký khuôn mặt OpenCV cho sinh viên " + studentCode, "SUCCESS"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error("Không thể mở cửa sổ đăng ký: " + e.getMessage()));
        }
    }
}
