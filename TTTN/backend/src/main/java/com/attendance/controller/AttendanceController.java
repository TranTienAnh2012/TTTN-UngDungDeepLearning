package com.attendance.controller;

import com.attendance.dto.*;
import com.attendance.model.ClassAttendance;
import com.attendance.model.ExamAttendance;
import com.attendance.service.AttendanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/attendance")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AttendanceController {

    private final AttendanceService attendanceService;

    @PostMapping("/class/check-in")
    public ResponseEntity<ApiResponse<CheckInResultDTO>> checkInClass(@RequestBody ClassCheckInRequest request) {
        if (request.getScheduleId() == null || request.getImage() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Thiếu scheduleId hoặc ảnh chụp khuôn mặt"));
        }
        CheckInResultDTO result = attendanceService.checkInClass(request);
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
        ExamCheckInResultDTO result = attendanceService.checkInExam(request);
        if (!result.isVerified()) {
            return ResponseEntity.ok(ApiResponse.<ExamCheckInResultDTO>builder().success(false).message(result.getMessage()).data(result).build());
        }
        return ResponseEntity.ok(ApiResponse.ok(result.getMessage(), result));
    }

    @GetMapping("/class/{scheduleId}")
    public ResponseEntity<ApiResponse<List<ClassAttendance>>> getClassAttendanceList(@PathVariable Long scheduleId) {
        return ResponseEntity.ok(ApiResponse.ok(attendanceService.getClassAttendanceList(scheduleId)));
    }

    @GetMapping("/exam/{examScheduleId}")
    public ResponseEntity<ApiResponse<List<ExamAttendance>>> getExamAttendanceList(@PathVariable Long examScheduleId) {
        return ResponseEntity.ok(ApiResponse.ok(attendanceService.getExamAttendanceList(examScheduleId)));
    }

    @PostMapping("/launch-desktop-scan")
    public ResponseEntity<ApiResponse<String>> launchDesktopScan(@RequestParam(required = false) String scheduleId) {
        try {
            String scriptPath = "d:\\TTTN-UngDungDeepLerning\\TTTN\\opencv_desktop\\main.py";
            String pythonExe = "C:\\Users\\TRANTIENANH\\AppData\\Local\\Programs\\Python\\Python310\\python.exe";
            if (!new java.io.File(pythonExe).exists()) {
                pythonExe = "python";
            }
            
            java.util.List<String> command = new java.util.ArrayList<>();
            command.add("cmd.exe");
            command.add("/c");
            command.add("start");
            command.add("cmd.exe");
            command.add("/k");
            command.add(pythonExe);
            command.add(scriptPath);
            if (scheduleId != null && !scheduleId.isEmpty()) {
                command.add("--schedule-id");
                command.add(scheduleId);
            }
            
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(new java.io.File("d:\\TTTN-UngDungDeepLerning\\TTTN\\opencv_desktop"));
            pb.start();
            return ResponseEntity.ok(ApiResponse.ok("Đã kích hoạt cửa sổ OpenCV Desktop (60 FPS) thành công", "SUCCESS"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error("Không thể mở ứng dụng OpenCV Desktop: " + e.getMessage()));
        }
    }

    @PostMapping("/launch-register-scan")
    public ResponseEntity<ApiResponse<String>> launchRegisterScan(@RequestParam String studentCode) {
        try {
            String scriptPath = "d:\\TTTN-UngDungDeepLerning\\TTTN\\opencv_desktop\\register.py";
            String pythonExe = "C:\\Users\\TRANTIENANH\\AppData\\Local\\Programs\\Python\\Python310\\python.exe";
            if (!new java.io.File(pythonExe).exists()) {
                pythonExe = "python";
            }
            
            java.util.List<String> command = new java.util.ArrayList<>();
            command.add("cmd.exe");
            command.add("/c");
            command.add("start");
            command.add("cmd.exe");
            command.add("/k");
            command.add(pythonExe);
            command.add(scriptPath);
            command.add("--student-code");
            command.add(studentCode);
            
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(new java.io.File("d:\\TTTN-UngDungDeepLerning\\TTTN\\opencv_desktop"));
            pb.start();
            return ResponseEntity.ok(ApiResponse.ok("Đã kích hoạt cửa sổ OpenCV Đăng ký khuôn mặt", "SUCCESS"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error("Không thể mở ứng dụng OpenCV: " + e.getMessage()));
        }
    }
}
