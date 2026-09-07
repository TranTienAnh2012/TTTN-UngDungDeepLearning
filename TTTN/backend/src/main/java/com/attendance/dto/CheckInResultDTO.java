package com.attendance.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CheckInResultDTO {
    private boolean success;
    private String studentCode;
    private String fullName;
    private String className;
    private String courseName;
    private String roomName;
    private LocalDateTime checkInTime;
    private String status; // PRESENT, LATE, ALREADY_CHECKED_IN, NOT_FOUND
    private Float confidenceScore;
    private java.util.List<Integer> bbox;
    private String message;
}
