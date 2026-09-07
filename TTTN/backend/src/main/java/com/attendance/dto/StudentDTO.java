package com.attendance.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StudentDTO {
    private Long id;
    private String studentCode;
    private String fullName;
    private LocalDate dateOfBirth;
    private String className;
    private boolean hasFaceRegistered;
    private String status;
}
