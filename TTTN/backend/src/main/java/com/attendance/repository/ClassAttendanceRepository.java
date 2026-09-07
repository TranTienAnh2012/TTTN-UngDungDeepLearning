package com.attendance.repository;

import com.attendance.model.ClassAttendance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClassAttendanceRepository extends JpaRepository<ClassAttendance, Long> {
    List<ClassAttendance> findByScheduleIdOrderByCheckInTimeDesc(Long scheduleId);
    List<ClassAttendance> findByStudentIdOrderByCheckInTimeDesc(Long studentId);
    Optional<ClassAttendance> findByScheduleIdAndStudentId(Long scheduleId, Long studentId);
    boolean existsByScheduleIdAndStudentId(Long scheduleId, Long studentId);
}
