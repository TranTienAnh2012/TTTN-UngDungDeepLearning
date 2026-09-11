package com.attendance.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AttendanceEventDTO {
    private String eventType;       // "CLASS_ATTENDANCE", "EXAM_ATTENDANCE", "STATUS_CHANGE"
    private Long scheduleId;
    private Long examScheduleId;
    private String studentCode;
    private String fullName;
    private String className;
    private Double confidence;
    private String checkInTime;
    private String status;          // "PRESENT", "VERIFIED", "BANNED", "SUSPICIOUS"
    private Integer seatRow;
    private Integer seatCol;
    private String message;
    private long timestamp;
}
