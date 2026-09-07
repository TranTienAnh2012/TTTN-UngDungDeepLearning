package com.attendance.controller;

import com.attendance.dto.ApiResponse;
import com.attendance.model.ClassSchedule;
import com.attendance.model.Course;
import com.attendance.model.ExamEligibility;
import com.attendance.model.ExamSchedule;
import com.attendance.service.ScheduleService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/schedules")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ScheduleController {

    private final ScheduleService scheduleService;

    // --- Courses Endpoints ---
    @GetMapping("/courses")
    public ResponseEntity<ApiResponse<List<Course>>> getAllCourses() {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.getAllCourses()));
    }

    @PostMapping("/courses")
    public ResponseEntity<ApiResponse<Course>> createCourse(@RequestBody Course course) {
        return ResponseEntity.ok(ApiResponse.ok("Thêm môn học thành công", scheduleService.createCourse(course)));
    }

    @PutMapping("/courses/{id}")
    public ResponseEntity<ApiResponse<Course>> updateCourse(@PathVariable Long id, @RequestBody Course course) {
        return ResponseEntity.ok(ApiResponse.ok("Cập nhật môn học thành công", scheduleService.updateCourse(id, course)));
    }

    @DeleteMapping("/courses/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCourse(@PathVariable Long id) {
        scheduleService.deleteCourse(id);
        return ResponseEntity.ok(ApiResponse.ok("Xóa môn học thành công", null));
    }

    // --- Class Schedules Endpoints ---
    @GetMapping("/class")
    public ResponseEntity<ApiResponse<List<ClassSchedule>>> getAllClassSchedules() {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.getAllClassSchedules()));
    }

    @GetMapping("/class/current")
    public ResponseEntity<ApiResponse<List<ClassSchedule>>> getCurrentClassSchedules() {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.getCurrentClassSchedules()));
    }

    @PostMapping("/class")
    public ResponseEntity<ApiResponse<ClassSchedule>> createClassSchedule(@RequestBody ClassScheduleRequest req) {
        ClassSchedule schedule = scheduleService.createClassSchedule(req.getCourseId(), req.getRoomName(), req.getStartTime(), req.getEndTime());
        return ResponseEntity.ok(ApiResponse.ok("Thêm lịch học thành công", schedule));
    }

    @PutMapping("/class/{id}")
    public ResponseEntity<ApiResponse<ClassSchedule>> updateClassSchedule(@PathVariable Long id, @RequestBody ClassScheduleRequest req) {
        ClassSchedule schedule = scheduleService.updateClassSchedule(id, req.getCourseId(), req.getRoomName(), req.getStartTime(), req.getEndTime());
        return ResponseEntity.ok(ApiResponse.ok("Cập nhật lịch học thành công", schedule));
    }

    @DeleteMapping("/class/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteClassSchedule(@PathVariable Long id) {
        scheduleService.deleteClassSchedule(id);
        return ResponseEntity.ok(ApiResponse.ok("Xóa lịch học thành công", null));
    }

    // --- Exam Schedules Endpoints ---
    @GetMapping("/exam")
    public ResponseEntity<ApiResponse<List<ExamSchedule>>> getAllExamSchedules() {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.getAllExamSchedules()));
    }

    @PostMapping("/exam")
    public ResponseEntity<ApiResponse<ExamSchedule>> createExamSchedule(@RequestBody ExamScheduleRequest req) {
        ExamSchedule schedule = scheduleService.createExamSchedule(req.getCourseId(), req.getExamRoom(), req.getExamTime());
        return ResponseEntity.ok(ApiResponse.ok("Thêm ca thi thành công", schedule));
    }

    @PutMapping("/exam/{id}")
    public ResponseEntity<ApiResponse<ExamSchedule>> updateExamSchedule(@PathVariable Long id, @RequestBody ExamScheduleRequest req) {
        ExamSchedule schedule = scheduleService.updateExamSchedule(id, req.getCourseId(), req.getExamRoom(), req.getExamTime());
        return ResponseEntity.ok(ApiResponse.ok("Cập nhật ca thi thành công", schedule));
    }

    @DeleteMapping("/exam/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteExamSchedule(@PathVariable Long id) {
        scheduleService.deleteExamSchedule(id);
        return ResponseEntity.ok(ApiResponse.ok("Xóa ca thi thành công", null));
    }

    // --- Exam Eligibility Endpoints ---
    @GetMapping("/exam/{examScheduleId}/eligibilities")
    public ResponseEntity<ApiResponse<List<ExamEligibility>>> getExamEligibilities(@PathVariable Long examScheduleId) {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.getExamEligibilities(examScheduleId)));
    }

    @PostMapping("/exam/eligibility/toggle")
    public ResponseEntity<ApiResponse<ExamEligibility>> toggleExamEligibility(@RequestBody EligibilityToggleRequest req) {
        ExamEligibility eligibility = scheduleService.toggleExamEligibility(req.getExamScheduleId(), req.getStudentId(), req.getIsEligible());
        return ResponseEntity.ok(ApiResponse.ok("Cập nhật điều kiện dự thi thành công", eligibility));
    }

    @PutMapping("/exam/{id}/seating")
    public ResponseEntity<ApiResponse<ExamSchedule>> updateExamSeating(
            @PathVariable Long id, 
            @RequestBody ExamSeatingRequest req) {
        ExamSchedule schedule = scheduleService.updateExamSeating(id, req.getSeatingRows(), req.getSeatingCols(), req.getDisabledSeats());
        return ResponseEntity.ok(ApiResponse.ok("Cập nhật sơ đồ phòng thi thành công", schedule));
    }

    @PostMapping("/exam/{id}/import-students")
    public ResponseEntity<ApiResponse<Map<String, Object>>> importExamStudents(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Vui lòng tải lên tệp tin Excel"));
        }
        Map<String, Object> result = scheduleService.importExamStudents(id, file);
        return ResponseEntity.ok(ApiResponse.ok("Nhập danh sách thí sinh và tự động xếp chỗ thành công", result));
    }

    // DTOs for Request Bodies
    @Data
    public static class ClassScheduleRequest {
        private Long courseId;
        private String roomName;
        private LocalDateTime startTime;
        private LocalDateTime endTime;
    }

    @Data
    public static class ExamScheduleRequest {
        private Long courseId;
        private String examRoom;
        private LocalDateTime examTime;
    }

    @Data
    public static class ExamSeatingRequest {
        private Integer seatingRows;
        private Integer seatingCols;
        private String disabledSeats;
    }

    @Data
    public static class EligibilityToggleRequest {
        private Long examScheduleId;
        private Long studentId;
        private Boolean isEligible;
    }
}
