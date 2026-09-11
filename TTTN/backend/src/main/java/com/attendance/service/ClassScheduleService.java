package com.attendance.service;

import com.attendance.model.ClassSchedule;
import com.attendance.model.Course;
import com.attendance.repository.ClassScheduleRepository;
import com.attendance.repository.CourseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ClassScheduleService {

    private final ClassScheduleRepository classScheduleRepository;
    private final CourseRepository courseRepository;

    public List<ClassSchedule> getAllClassSchedules() {
        return classScheduleRepository.findAllByOrderByStartTimeDesc();
    }

    public List<ClassSchedule> getCurrentClassSchedules() {
        return classScheduleRepository.findCurrentSchedules(LocalDateTime.now());
    }

    public ClassSchedule getClassScheduleById(Long id) {
        return classScheduleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy ca học ID: " + id));
    }

    public ClassSchedule createClassSchedule(Long courseId, String roomName, LocalDateTime startTime, LocalDateTime endTime) {
        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy môn học ID: " + courseId));

        ClassSchedule schedule = ClassSchedule.builder()
                .course(course)
                .roomName(roomName)
                .startTime(startTime)
                .endTime(endTime)
                .build();
        return classScheduleRepository.save(schedule);
    }

    public ClassSchedule updateClassSchedule(Long id, Long courseId, String roomName, LocalDateTime startTime, LocalDateTime endTime) {
        ClassSchedule existing = getClassScheduleById(id);
        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy môn học ID: " + courseId));

        existing.setCourse(course);
        existing.setRoomName(roomName);
        existing.setStartTime(startTime);
        existing.setEndTime(endTime);
        return classScheduleRepository.save(existing);
    }

    public void deleteClassSchedule(Long id) {
        classScheduleRepository.deleteById(id);
    }
}
