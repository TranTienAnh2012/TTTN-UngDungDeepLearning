package com.attendance.repository;

import com.attendance.model.Student;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface StudentRepository extends JpaRepository<Student, Long> {
    Optional<Student> findByStudentCode(String studentCode);
    List<Student> findByStatus(String status);
    List<Student> findByFaceEmbeddingIsNotNull();
    boolean existsByStudentCode(String studentCode);
}
