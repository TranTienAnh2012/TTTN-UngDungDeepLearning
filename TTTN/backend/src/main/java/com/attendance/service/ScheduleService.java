package com.attendance.service;

import com.attendance.model.ClassSchedule;
import com.attendance.model.Course;
import com.attendance.model.ExamEligibility;
import com.attendance.model.ExamSchedule;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ScheduleService {

    private final CourseService courseService;
    private final ClassScheduleService classScheduleService;
    private final ExamScheduleService examScheduleService;

    // --- Courses ---
    public List<Course> getAllCourses() {
        return courseService.getAllCourses();
    }

    public Course createCourse(Course course) {
        return courseService.createCourse(course);
    }

    public Course updateCourse(Long id, Course updated) {
        return courseService.updateCourse(id, updated);
    }

    public void deleteCourse(Long id) {
        courseService.deleteCourse(id);
    }

    // --- Class Schedules ---
    public List<ClassSchedule> getAllClassSchedules() {
        return classScheduleService.getAllClassSchedules();
    }

    public List<ClassSchedule> getCurrentClassSchedules() {
        return classScheduleService.getCurrentClassSchedules();
    }

    public ClassSchedule createClassSchedule(Long courseId, String roomName, LocalDateTime startTime, LocalDateTime endTime) {
        return classScheduleService.createClassSchedule(courseId, roomName, startTime, endTime);
    }

    public ClassSchedule updateClassSchedule(Long id, Long courseId, String roomName, LocalDateTime startTime, LocalDateTime endTime) {
        return classScheduleService.updateClassSchedule(id, courseId, roomName, startTime, endTime);
    }

    public void deleteClassSchedule(Long id) {
        classScheduleService.deleteClassSchedule(id);
    }

    // --- Exam Schedules ---
    public List<ExamSchedule> getAllExamSchedules() {
        return examScheduleService.getAllExamSchedules();
    }

    public ExamSchedule createExamSchedule(Long courseId, String examRoom, LocalDateTime examTime) {
        return examScheduleService.createExamSchedule(courseId, examRoom, examTime);
    }

    public ExamSchedule updateExamSchedule(Long id, Long courseId, String examRoom, LocalDateTime examTime) {
        return examScheduleService.updateExamSchedule(id, courseId, examRoom, examTime);
    }

    public void deleteExamSchedule(Long id) {
        examScheduleService.deleteExamSchedule(id);
    }

    public ExamSchedule updateExamSeating(Long examScheduleId, Integer rows, Integer cols, String disabledSeats) {
        return examScheduleService.updateExamSeating(examScheduleId, rows, cols, disabledSeats);
    }

    public List<ExamEligibility> getExamEligibilities(Long examScheduleId) {
        return examScheduleService.getExamEligibilities(examScheduleId);
    }

    public ExamEligibility toggleExamEligibility(Long examScheduleId, Long studentId, Boolean isEligible) {
        return examScheduleService.toggleExamEligibility(examScheduleId, studentId, isEligible);
    }

    public Map<String, Object> importExamStudents(Long examScheduleId, MultipartFile file) {
        return examScheduleService.importExamStudents(examScheduleId, file);
    }
}
