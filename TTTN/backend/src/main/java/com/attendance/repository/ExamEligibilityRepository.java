package com.attendance.repository;

import com.attendance.model.ExamEligibility;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ExamEligibilityRepository extends JpaRepository<ExamEligibility, Long> {
    List<ExamEligibility> findByExamScheduleId(Long examScheduleId);
    Optional<ExamEligibility> findByExamScheduleIdAndStudentId(Long examScheduleId, Long studentId);
}
