package com.attendance.config;

import com.attendance.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiResponse<Void>> handleRuntimeException(RuntimeException e) {
        log.warn("Handled business exception: {}", e.getMessage());
        return ResponseEntity.ok(ApiResponse.error(e.getMessage()));
    }

    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public ResponseEntity<Void> handleNoResourceFoundException(org.springframework.web.servlet.resource.NoResourceFoundException e) {
        return ResponseEntity.notFound().build();
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGenericException(Exception e) {
        log.error("Unhandled system exception: {}", e.getMessage(), e);
        return ResponseEntity.internalServerError().body(ApiResponse.error("Lỗi hệ thống: " + e.getMessage()));
    }
}
