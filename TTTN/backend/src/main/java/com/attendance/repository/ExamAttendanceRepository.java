package com.attendance.repository;

import com.attendance.model.ExamAttendance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ExamAttendanceRepository extends JpaRepository<ExamAttendance, Long> {
    List<ExamAttendance> findByExamScheduleIdOrderByCheckInTimeDesc(Long examScheduleId);
    Optional<ExamAttendance> findByExamScheduleIdAndStudentId(Long examScheduleId, Long studentId);
    boolean existsByExamScheduleIdAndStudentId(Long examScheduleId, Long studentId);
}
