package com.attendance.dto;

import lombok.Data;

@Data
public class ClassCheckInRequest {
    private Long scheduleId;
    private String image; // Base64
}
