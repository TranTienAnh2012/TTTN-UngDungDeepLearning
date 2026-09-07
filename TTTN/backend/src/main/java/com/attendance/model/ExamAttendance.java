package com.attendance.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "exam_attendance")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExamAttendance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "student_id", nullable = false)
    private Student student;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "exam_schedule_id", nullable = false)
    private ExamSchedule examSchedule;

    @Column(name = "check_in_time", nullable = false)
    private LocalDateTime checkInTime;

    @Column(name = "is_verified", nullable = false)
    @Builder.Default
    private Boolean isVerified = true;

    @Column(name = "seat_row")
    private Integer seatRow;

    @Column(name = "seat_col")
    private Integer seatCol;
}
