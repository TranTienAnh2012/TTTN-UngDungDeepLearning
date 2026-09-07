package com.attendance.dto;

import lombok.Data;

@Data
public class FaceRegisterRequest {
    private String studentCode;
    private String image; // Base64
}
