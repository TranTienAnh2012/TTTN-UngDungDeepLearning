package com.attendance.service;

import com.attendance.model.Course;
import com.attendance.model.ExamEligibility;
import com.attendance.model.ExamSchedule;
import com.attendance.model.Student;
import com.attendance.repository.CourseRepository;
import com.attendance.repository.ExamEligibilityRepository;
import com.attendance.repository.ExamScheduleRepository;
import com.attendance.repository.StudentRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ExamScheduleService {

    private final ExamScheduleRepository examScheduleRepository;
    private final CourseRepository courseRepository;
    private final ExamEligibilityRepository examEligibilityRepository;
    private final StudentRepository studentRepository;

    public List<ExamSchedule> getAllExamSchedules() {
        return examScheduleRepository.findAllByOrderByExamTimeDesc();
    }

    public ExamSchedule getExamScheduleById(Long id) {
        return examScheduleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy ca thi ID: " + id));
    }

    public ExamSchedule createExamSchedule(Long courseId, String examRoom, LocalDateTime examTime) {
        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy môn học ID: " + courseId));

        ExamSchedule schedule = ExamSchedule.builder()
                .course(course)
                .examRoom(examRoom)
                .examTime(examTime)
                .seatingRows(5)
                .seatingCols(5)
                .disabledSeats("[]")
                .build();
        return examScheduleRepository.save(schedule);
    }

    public ExamSchedule updateExamSchedule(Long id, Long courseId, String examRoom, LocalDateTime examTime) {
        ExamSchedule existing = getExamScheduleById(id);
        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy môn học ID: " + courseId));

        existing.setCourse(course);
        existing.setExamRoom(examRoom);
        existing.setExamTime(examTime);
        return examScheduleRepository.save(existing);
    }

    public void deleteExamSchedule(Long id) {
        examScheduleRepository.deleteById(id);
    }

    public ExamSchedule updateExamSeating(Long examScheduleId, Integer rows, Integer cols, String disabledSeats) {
        ExamSchedule schedule = getExamScheduleById(examScheduleId);
        if (rows != null && rows > 0 && rows <= 10) schedule.setSeatingRows(rows);
        if (cols != null && cols > 0 && cols <= 10) schedule.setSeatingCols(cols);
        if (disabledSeats != null) schedule.setDisabledSeats(disabledSeats);
        return examScheduleRepository.save(schedule);
    }

    public List<ExamEligibility> getExamEligibilities(Long examScheduleId) {
        return examEligibilityRepository.findByExamScheduleId(examScheduleId);
    }

    @Transactional
    public ExamEligibility toggleExamEligibility(Long examScheduleId, Long studentId, Boolean isEligible) {
        ExamSchedule schedule = getExamScheduleById(examScheduleId);
        Student student = studentRepository.findById(studentId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy sinh viên ID: " + studentId));

        Optional<ExamEligibility> opt = examEligibilityRepository.findByExamScheduleIdAndStudentId(examScheduleId, studentId);
        ExamEligibility eligibility;
        if (opt.isPresent()) {
            eligibility = opt.get();
            eligibility.setIsEligible(isEligible);
        } else {
            eligibility = ExamEligibility.builder()
                    .student(student)
                    .examSchedule(schedule)
                    .isEligible(isEligible)
                    .build();
        }
        return examEligibilityRepository.save(eligibility);
    }

    @Transactional
    public Map<String, Object> importExamStudents(Long examScheduleId, MultipartFile file) {
        ExamSchedule examSchedule = getExamScheduleById(examScheduleId);
        int rows = examSchedule.getSeatingRows() != null ? examSchedule.getSeatingRows() : 5;
        int cols = examSchedule.getSeatingCols() != null ? examSchedule.getSeatingCols() : 5;

        Set<String> disabledSet = new HashSet<>();
        String disabledStr = examSchedule.getDisabledSeats();
        if (disabledStr != null && !disabledStr.trim().isEmpty() && !disabledStr.equals("null")) {
            disabledStr = disabledStr.replace("[", "").replace("]", "").replace("\"", "").trim();
            if (!disabledStr.isEmpty()) {
                String[] parts = disabledStr.split(",");
                for (String p : parts) {
                    disabledSet.add(p.trim());
                }
            }
        }

        List<int[]> availableSeats = new ArrayList<>();
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                String coord = r + "-" + c;
                if (!disabledSet.contains(coord)) {
                    availableSeats.add(new int[]{r, c});
                }
            }
        }

        int importedCount = 0;
        int seatsAssigned = 0;
        int unassignedCount = 0;
        int errorRows = 0;
        int seatIndex = 0;

        try (InputStream is = file.getInputStream();
             Workbook workbook = new XSSFWorkbook(is)) {

            Sheet sheet = workbook.getSheetAt(0);
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                Cell codeCell = row.getCell(1);
                if (codeCell == null) continue;

                String studentCode = getCellValueAsString(codeCell).trim();
                if (studentCode.isEmpty()) continue;

                Optional<Student> studentOpt = studentRepository.findByStudentCode(studentCode);
                if (studentOpt.isEmpty()) {
                    errorRows++;
                    continue;
                }

                Student student = studentOpt.get();
                importedCount++;

                Integer assignedRow = null;
                Integer assignedCol = null;
                if (seatIndex < availableSeats.size()) {
                    int[] seat = availableSeats.get(seatIndex++);
                    assignedRow = seat[0];
                    assignedCol = seat[1];
                    seatsAssigned++;
                } else {
                    unassignedCount++;
                }

                Optional<ExamEligibility> existingOpt = examEligibilityRepository.findByExamScheduleIdAndStudentId(examScheduleId, student.getId());
                ExamEligibility eligibility;
                if (existingOpt.isPresent()) {
                    eligibility = existingOpt.get();
                    eligibility.setSeatRow(assignedRow);
                    eligibility.setSeatCol(assignedCol);
                    eligibility.setIsEligible(true);
                } else {
                    eligibility = ExamEligibility.builder()
                            .student(student)
                            .examSchedule(examSchedule)
                            .isEligible(true)
                            .seatRow(assignedRow)
                            .seatCol(assignedCol)
                            .build();
                }
                examEligibilityRepository.save(eligibility);
            }

        } catch (Exception e) {
            throw new RuntimeException("Lỗi xử lý file Excel ca thi: " + e.getMessage(), e);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("importedCount", importedCount);
        result.put("seatsAssigned", seatsAssigned);
        result.put("unassignedCount", unassignedCount);
        result.put("errorRows", errorRows);
        return result;
    }

    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getDateCellValue().toString();
                } else {
                    double num = cell.getNumericCellValue();
                    if (num == Math.floor(num)) {
                        return String.valueOf((long) num);
                    }
                    return String.valueOf(num);
                }
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            default:
                return "";
        }
    }
}
