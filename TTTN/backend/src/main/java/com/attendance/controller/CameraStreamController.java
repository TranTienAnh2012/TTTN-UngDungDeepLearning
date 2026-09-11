package com.attendance.controller;

import com.attendance.dto.ApiResponse;
import com.attendance.dto.AttendanceEventDTO;
import com.attendance.dto.CameraStreamFrameDTO;
import com.attendance.service.CameraStreamService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/camera")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class CameraStreamController {

    private final CameraStreamService cameraStreamService;

    @PostMapping("/start")
    public ResponseEntity<ApiResponse<Map<String, Object>>> startCamera(
            @RequestParam(required = false) String scheduleId,
            @RequestParam(required = false) String examScheduleId) {
        Map<String, Object> result = cameraStreamService.startCameraStream(scheduleId, examScheduleId);
        boolean success = Boolean.TRUE.equals(result.get("success"));
        if (success) {
            return ResponseEntity.ok(ApiResponse.ok(String.valueOf(result.get("message")), result));
        } else {
            return ResponseEntity.badRequest().body(ApiResponse.error(String.valueOf(result.get("message"))));
        }
    }

    @PostMapping("/register/start")
    public ResponseEntity<ApiResponse<Map<String, Object>>> startRegisterCamera(
            @RequestParam String studentCode,
            @RequestParam(required = false) String fullName,
            @RequestParam(required = false) String className) {
        Map<String, Object> result = cameraStreamService.startRegisterStream(studentCode, fullName, className);
        boolean success = Boolean.TRUE.equals(result.get("success"));
        if (success) {
            return ResponseEntity.ok(ApiResponse.ok(String.valueOf(result.get("message")), result));
        } else {
            return ResponseEntity.badRequest().body(ApiResponse.error(String.valueOf(result.get("message"))));
        }
    }

    @PostMapping("/stop")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stopCamera() {
        Map<String, Object> result = cameraStreamService.stopCameraStream();
        return ResponseEntity.ok(ApiResponse.ok("Đã dừng camera", result));
    }

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStatus() {
        return ResponseEntity.ok(ApiResponse.ok(cameraStreamService.getCameraStatus()));
    }

    /**
     * Endpoint nhận frame từ tiến trình Python OpenCV và đẩy tức thì qua STOMP WebSocket topic
     */
    @PostMapping("/stream-frame")
    public ResponseEntity<Void> receiveStreamFrame(@RequestBody CameraStreamFrameDTO frame) {
        cameraStreamService.processIncomingFrame(frame);
        return ResponseEntity.ok().build();
    }

    /**
     * Endpoint nhận sự kiện điểm danh từ Python OpenCV và phát sóng tới toàn bộ client STOMP
     */
    @PostMapping("/attendance-event")
    public ResponseEntity<Void> receiveAttendanceEvent(@RequestBody AttendanceEventDTO event) {
        cameraStreamService.processAttendanceEvent(event);
        return ResponseEntity.ok().build();
    }

    /**
     * Hỗ trợ nhận thông điệp điều khiển camera trực tiếp từ STOMP client (nếu client gửi qua STOMP /app/camera-control)
     */
    @MessageMapping("/camera-control")
    public void handleCameraControl(@Payload Map<String, String> payload) {
        String action = payload.get("action");
        if ("START".equalsIgnoreCase(action)) {
            cameraStreamService.startCameraStream(payload.get("scheduleId"), payload.get("examScheduleId"));
        } else if ("STOP".equalsIgnoreCase(action)) {
            cameraStreamService.stopCameraStream();
        }
    }
}
