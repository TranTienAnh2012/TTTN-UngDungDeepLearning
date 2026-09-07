package com.attendance.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "exam_eligibility")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExamEligibility {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "exam_schedule_id", nullable = false)
    private ExamSchedule examSchedule;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "student_id", nullable = false)
    private Student student;

    @Column(name = "is_eligible")
    @Builder.Default
    private Boolean isEligible = true;

    @Column(name = "seat_row")
    private Integer seatRow;

    @Column(name = "seat_col")
    private Integer seatCol;
}
