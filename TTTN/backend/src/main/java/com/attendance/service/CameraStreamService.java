package com.attendance.service;

import com.attendance.dto.AttendanceEventDTO;
import com.attendance.dto.CameraStreamFrameDTO;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
@Slf4j
@RequiredArgsConstructor
public class CameraStreamService {

    private final SimpMessagingTemplate messagingTemplate;

    @Value("${server.port:8080}")
    private String serverPort;

    private Process currentProcess = null;
    private final AtomicBoolean isRunning = new AtomicBoolean(false);
    private String activeScheduleId = null;
    private String activeExamScheduleId = null;
    private String activeMode = "IDLE"; // "CLASS", "EXAM", "IDLE"

    private String getPythonExecutable() {
        String userName = System.getProperty("user.name");
        String[] candidatePaths = {
                "C:\\Users\\admin\\AppData\\Local\\Programs\\Python\\Python310\\python.exe",
                "C:\\Users\\" + userName + "\\AppData\\Local\\Programs\\Python\\Python310\\python.exe",
                "C:\\Users\\TRANTIENANH\\AppData\\Local\\Programs\\Python\\Python310\\python.exe",
                "C:\\Python310\\python.exe"
        };

        for (String path : candidatePaths) {
            File f = new File(path);
            if (f.exists()) {
                return path;
            }
        }
        return "python";
    }

    private String getWorkingDir() {
        String primary = "d:\\TTTN-UngDungDeepLerning\\OPENCV-SCAN";
        if (new File(primary).exists()) {
            return primary;
        }
        return "d:\\TTTN-UngDungDeepLerning\\TTTN\\opencv_desktop";
    }

    public synchronized Map<String, Object> startCameraStream(String scheduleId, String examScheduleId) {
        Map<String, Object> res = new HashMap<>();

        // If already running with the same parameters, just return OK
        if (isRunning.get() && currentProcess != null && currentProcess.isAlive()) {
            if (Objects.equals(activeScheduleId, scheduleId) && Objects.equals(activeExamScheduleId, examScheduleId)) {
                res.put("success", true);
                res.put("message", "Camera đang phát sóng cho phiên này");
                res.put("status", "ALREADY_RUNNING");
                return res;
            } else {
                // Stop current process before starting with new parameters
                stopCameraStream();
            }
        }

        try {
            String workDir = getWorkingDir();
            String scriptPath = workDir + File.separator + "main.py";
            String pythonExe = getPythonExecutable();
            String streamUrl = "http://127.0.0.1:" + serverPort;

            List<String> command = new ArrayList<>();
            command.add(pythonExe);
            command.add(scriptPath);
            command.add("--headless");
            command.add("--stream-url");
            command.add(streamUrl);

            if (scheduleId != null && !scheduleId.trim().isEmpty() && !"null".equalsIgnoreCase(scheduleId)) {
                command.add("--schedule-id");
                command.add(scheduleId.trim());
                this.activeScheduleId = scheduleId.trim();
                this.activeExamScheduleId = null;
                this.activeMode = "CLASS";
            } else if (examScheduleId != null && !examScheduleId.trim().isEmpty() && !"null".equalsIgnoreCase(examScheduleId)) {
                command.add("--exam-schedule-id");
                command.add(examScheduleId.trim());
                this.activeScheduleId = null;
                this.activeExamScheduleId = examScheduleId.trim();
                this.activeMode = "EXAM";
            } else {
                this.activeScheduleId = null;
                this.activeExamScheduleId = null;
                this.activeMode = "GENERAL";
            }

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(new File(workDir));
            pb.redirectErrorStream(true);

            currentProcess = pb.start();
            isRunning.set(true);

            // Read log output asynchronously so process stdout doesn't buffer and hang
            Thread logThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(currentProcess.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        log.info("[Python OpenCV] {}", line);
                    }
                } catch (Exception e) {
                    // Stream closed
                } finally {
                    isRunning.set(false);
                    broadcastStatusChange("STOPPED", "Camera đã dừng");
                }
            });
            logThread.setDaemon(true);
            logThread.start();

            log.info("Launched Headless OpenCV Stream Worker from: {} (Schedule: {}, Exam: {})", scriptPath, scheduleId, examScheduleId);

            broadcastStatusChange("STARTED", "Camera OpenCV đã kích hoạt luồng Web Stream");

            res.put("success", true);
            res.put("message", "Đã khởi động camera trực tiếp Web thành công");
            res.put("mode", activeMode);
            res.put("scheduleId", activeScheduleId);
            res.put("examScheduleId", activeExamScheduleId);
            return res;

        } catch (Exception e) {
            log.error("Failed to start OpenCV stream process: {}", e.getMessage(), e);
            isRunning.set(false);
            res.put("success", false);
            res.put("message", "Lỗi khởi chạy OpenCV: " + e.getMessage());
            return res;
        }
    }

    public synchronized Map<String, Object> startRegisterStream(String studentCode, String fullName, String className) {
        Map<String, Object> res = new HashMap<>();
        stopCameraStream();

        try {
            String workDir = getWorkingDir();
            String scriptPath = workDir + File.separator + "enroll.py";
            if (!new File(scriptPath).exists()) {
                scriptPath = workDir + File.separator + "register.py";
            }
            String pythonExe = getPythonExecutable();
            String streamUrl = "http://127.0.0.1:" + serverPort;

            List<String> command = new ArrayList<>();
            command.add(pythonExe);
            command.add(scriptPath);
            command.add("--headless");
            command.add("--stream-url");
            command.add(streamUrl);

            if (studentCode != null && !studentCode.trim().isEmpty()) {
                command.add("--student-code");
                command.add(studentCode.trim());
            }
            if (fullName != null && !fullName.trim().isEmpty()) {
                command.add("--full-name");
                command.add(fullName.trim());
            }
            if (className != null && !className.trim().isEmpty()) {
                command.add("--class-name");
                command.add(className.trim());
            }

            this.activeMode = "REGISTER";
            this.activeScheduleId = null;
            this.activeExamScheduleId = null;

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(new File(workDir));
            pb.redirectErrorStream(true);

            currentProcess = pb.start();
            isRunning.set(true);

            Thread logThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(currentProcess.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        log.info("[Python Enroll] {}", line);
                    }
                } catch (Exception e) {
                } finally {
                    isRunning.set(false);
                    broadcastStatusChange("STOPPED", "Camera đăng ký đã dừng");
                }
            });
            logThread.setDaemon(true);
            logThread.start();

            log.info("Launched Headless OpenCV Registration Stream for student: {}", studentCode);
            broadcastStatusChange("STARTED", "Camera OpenCV đăng ký đã kích hoạt luồng Web Stream");

            res.put("success", true);
            res.put("message", "Đã khởi động camera đăng ký khuôn mặt trực tiếp");
            res.put("mode", "REGISTER");
            return res;
        } catch (Exception e) {
            log.error("Failed to start register stream process: {}", e.getMessage(), e);
            isRunning.set(false);
            res.put("success", false);
            res.put("message", "Lỗi khởi chạy OpenCV đăng ký: " + e.getMessage());
            return res;
        }
    }

    public synchronized Map<String, Object> stopCameraStream() {
        Map<String, Object> res = new HashMap<>();
        try {
            if (currentProcess != null && currentProcess.isAlive()) {
                currentProcess.destroy();
                // Force kill if not terminated after 1 second
                Thread.sleep(300);
                if (currentProcess.isAlive()) {
                    currentProcess.destroyForcibly();
                }
                log.info("Stopped OpenCV Camera Stream process.");
            }
            isRunning.set(false);
            activeScheduleId = null;
            activeExamScheduleId = null;
            activeMode = "IDLE";
            currentProcess = null;

            broadcastStatusChange("STOPPED", "Camera đã tắt");

            res.put("success", true);
            res.put("message", "Đã dừng luồng camera OpenCV");
            return res;
        } catch (Exception e) {
            log.error("Error stopping OpenCV process: {}", e.getMessage(), e);
            res.put("success", false);
            res.put("message", "Lỗi khi dừng camera: " + e.getMessage());
            return res;
        }
    }

    public Map<String, Object> getCameraStatus() {
        Map<String, Object> status = new HashMap<>();
        boolean running = isRunning.get() && currentProcess != null && currentProcess.isAlive();
        status.put("isRunning", running);
        status.put("mode", activeMode);
        status.put("activeScheduleId", activeScheduleId);
        status.put("activeExamScheduleId", activeExamScheduleId);
        return status;
    }

    public void processIncomingFrame(CameraStreamFrameDTO frame) {
        if (frame != null && frame.getImage() != null) {
            messagingTemplate.convertAndSend("/topic/camera-stream", frame);
        }
    }

    public void processAttendanceEvent(AttendanceEventDTO event) {
        if (event != null) {
            event.setTimestamp(System.currentTimeMillis());
            messagingTemplate.convertAndSend("/topic/attendance-events", event);
            log.info("📢 Broadcasted Attendance Event: {} - {} ({})", event.getEventType(), event.getFullName(), event.getStudentCode());
        }
    }

    private void broadcastStatusChange(String status, String message) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("status", status);
        payload.put("message", message);
        payload.put("timestamp", System.currentTimeMillis());
        messagingTemplate.convertAndSend("/topic/camera-status", payload);
    }

    @PreDestroy
    public void cleanup() {
        log.info("Cleaning up CameraStreamService on Spring Boot shutdown...");
        stopCameraStream();
    }
}
