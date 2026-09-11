package com.attendance.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

@Service
@Slf4j
public class OpenCvDesktopService {

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

    public void launchDesktopScan(String scheduleId) throws Exception {
        String workDir = getWorkingDir();
        String scriptPath = workDir + File.separator + "main.py";
        String pythonExe = getPythonExecutable();

        StringBuilder cmdArgs = new StringBuilder();
        cmdArgs.append("\"").append(pythonExe).append("\" \"").append(scriptPath).append("\"");
        if (scheduleId != null && !scheduleId.trim().isEmpty()) {
            cmdArgs.append(" --schedule-id \"").append(scheduleId.trim()).append("\"");
        }

        // Start new CMD window with proper Title and quotes
        String startCmd = "start \"Diem Danh Face ID (60 FPS)\" cmd.exe /k \"" + cmdArgs.toString() + "\"";

        List<String> command = new ArrayList<>();
        command.add("cmd.exe");
        command.add("/c");
        command.add(startCmd);

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(new File(workDir));
        pb.start();
        log.info("Launched OpenCV Desktop Scan from: {} with Python: {}", scriptPath, pythonExe);
    }

    public void launchRegisterScan(String studentCode, String fullName, String className) throws Exception {
        String workDir = getWorkingDir();
        String scriptPath = workDir + File.separator + "enroll.py";
        if (!new File(scriptPath).exists()) {
            scriptPath = workDir + File.separator + "register.py";
        }
        String pythonExe = getPythonExecutable();

        StringBuilder cmdArgs = new StringBuilder();
        cmdArgs.append("\"").append(pythonExe).append("\" \"").append(scriptPath).append("\"");
        if (studentCode != null && !studentCode.trim().isEmpty()) {
            cmdArgs.append(" --student-code \"").append(studentCode.trim()).append("\"");
        }
        if (fullName != null && !fullName.trim().isEmpty()) {
            cmdArgs.append(" --full-name \"").append(fullName.trim()).append("\"");
        }
        if (className != null && !className.trim().isEmpty()) {
            cmdArgs.append(" --class-name \"").append(className.trim()).append("\"");
        }

        // Start new CMD window with proper Title and quotes
        String startCmd = "start \"Dang Ky Face ID Liveness (InsightFace)\" cmd.exe /k \"" + cmdArgs.toString() + "\"";

        List<String> command = new ArrayList<>();
        command.add("cmd.exe");
        command.add("/c");
        command.add(startCmd);

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(new File(workDir));
        pb.start();
        log.info("Launched OpenCV Registration Scan command: {} in dir: {}", startCmd, workDir);
    }
}
