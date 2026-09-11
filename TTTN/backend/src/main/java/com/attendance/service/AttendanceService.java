package com.attendance.service;

import com.attendance.dto.CheckInResultDTO;
import com.attendance.dto.ClassCheckInRequest;
import com.attendance.dto.ExamCheckInRequest;
import com.attendance.dto.ExamCheckInResultDTO;
import com.attendance.model.ClassAttendance;
import com.attendance.model.ExamAttendance;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AttendanceService {

    private final ClassAttendanceService classAttendanceService;
    private final ExamAttendanceService examAttendanceService;

    public CheckInResultDTO checkInClass(ClassCheckInRequest request) {
        return classAttendanceService.checkInClass(request);
    }

    public List<ClassAttendance> getClassAttendanceList(Long scheduleId) {
        return classAttendanceService.getClassAttendanceList(scheduleId);
    }

    public ExamCheckInResultDTO checkInExam(ExamCheckInRequest request) {
        return examAttendanceService.checkInExam(request);
    }

    public List<ExamAttendance> getExamAttendanceList(Long examScheduleId) {
        return examAttendanceService.getExamAttendanceList(examScheduleId);
    }
}
