package com.attendance.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;

@Entity
@Table(name = "students")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Student {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_code", unique = true, nullable = false, length = 50)
    private String studentCode;

    @Column(name = "full_name", nullable = false, length = 100)
    private String fullName;

    @Column(name = "date_of_birth", nullable = false)
    private LocalDate dateOfBirth;

    @Column(name = "class_name", length = 50)
    private String className;

    @Column(name = "face_embedding", columnDefinition = "TEXT")
    private String faceEmbedding;

    @Column(name = "status", length = 20)
    @Builder.Default
    private String status = "ACTIVE";
}
