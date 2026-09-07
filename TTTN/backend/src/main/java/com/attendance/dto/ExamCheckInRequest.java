package com.attendance.dto;

import lombok.Data;

@Data
public class ExamCheckInRequest {
    private Long examScheduleId;
    private String image; // Base64
}
