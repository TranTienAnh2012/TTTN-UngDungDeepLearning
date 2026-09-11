package com.attendance.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CameraStreamFrameDTO {
    private String image;       // Base64 JPEG data URL: "data:image/jpeg;base64,..."
    private int facesCount;     // Số khuôn mặt phát hiện trong frame
    private double fps;         // Tốc độ khung hình xử lý hiện tại
    private String status;      // Trạng thái: "SCANNING", "MATCHED", "IDLE", "STOPPED"
    private long timestamp;     // Unix timestamp (ms)
}
