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
public class ExamCheckInResultDTO {
    private boolean verified;
    private boolean eligible; // true: đủ điều kiện; false: cấm thi
    private String studentCode;
    private String fullName;
    private String className;
    private String courseName;
    private String examRoom;
    private LocalDateTime examTime;
    private LocalDateTime checkInTime;
    private Float confidenceScore;
    private java.util.List<Integer> bbox;
    private String decision; // "ALLOWED" (Cho phép vào phòng thi), "DENIED" (Từ chối / Cấm thi), "NOT_FOUND"
    private String message;
    private Integer seatRow;
    private Integer seatCol;
}
