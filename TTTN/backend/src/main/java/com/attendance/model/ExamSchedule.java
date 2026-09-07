package com.attendance.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "exam_schedules")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExamSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "course_id")
    private Course course;

    @Column(name = "exam_room", nullable = false, length = 50)
    private String examRoom;

    @Column(name = "exam_time", nullable = false)
    private LocalDateTime examTime;

    @Column(name = "seating_rows", nullable = false)
    @Builder.Default
    private Integer seatingRows = 5;

    @Column(name = "seating_cols", nullable = false)
    @Builder.Default
    private Integer seatingCols = 5;

    @Column(name = "disabled_seats", columnDefinition = "TEXT")
    private String disabledSeats;
}
