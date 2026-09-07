package com.attendance.service;

import com.attendance.model.*;
import com.attendance.repository.*;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ScheduleService {

    private final CourseRepository courseRepository;
    private final ClassScheduleRepository classScheduleRepository;
    private final ExamScheduleRepository examScheduleRepository;
    private final ExamEligibilityRepository examEligibilityRepository;
    private final StudentRepository studentRepository;

    // --- Courses CRUD ---
    public List<Course> getAllCourses() {
        return courseRepository.findAll();
    }

    public Course createCourse(Course course) {
        if (courseRepository.findByCourseCode(course.getCourseCode()).isPresent()) {
            throw new RuntimeException("Mã môn học " + course.getCourseCode() + " đã tồn tại!");
        }
        return courseRepository.save(course);
    }

    public Course updateCourse(Long id, Course updated) {
        Course existing = courseRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy môn học ID: " + id));
        existing.setCourseCode(updated.getCourseCode());
        existing.setCourseName(updated.getCourseName());
        return courseRepository.save(existing);
    }

    public void deleteCourse(Long id) {
        courseRepository.deleteById(id);
    }

    // --- Class Schedules CRUD ---
    public List<ClassSchedule> getAllClassSchedules() {
        return classScheduleRepository.findAllByOrderByStartTimeDesc();
    }

    public List<ClassSchedule> getCurrentClassSchedules() {
        return classScheduleRepository.findCurrentSchedules(LocalDateTime.now());
    }

    public ClassSchedule createClassSchedule(Long courseId, String roomName, LocalDateTime startTime, LocalDateTime endTime) {
        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy môn học ID: " + courseId));
        ClassSchedule schedule = ClassSchedule.builder()
                .course(course)
                .roomName(roomName)
                .startTime(startTime)
                .endTime(endTime)
                .build();
        return classScheduleRepository.save(schedule);
    }

    public ClassSchedule updateClassSchedule(Long id, Long courseId, String roomName, LocalDateTime startTime, LocalDateTime endTime) {
        ClassSchedule existing = classScheduleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy lịch học ID: " + id));
        if (courseId != null) {
            Course course = courseRepository.findById(courseId)
                    .orElseThrow(() -> new RuntimeException("Không tìm thấy môn học ID: " + courseId));
            existing.setCourse(course);
        }
        existing.setRoomName(roomName);
        existing.setStartTime(startTime);
        existing.setEndTime(endTime);
        return classScheduleRepository.save(existing);
    }

    public void deleteClassSchedule(Long id) {
        classScheduleRepository.deleteById(id);
    }

    // --- Exam Schedules CRUD ---
    public List<ExamSchedule> getAllExamSchedules() {
        return examScheduleRepository.findAllByOrderByExamTimeDesc();
    }

    @Transactional
    public ExamSchedule createExamSchedule(Long courseId, String examRoom, LocalDateTime examTime) {
        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy môn học ID: " + courseId));
        ExamSchedule schedule = ExamSchedule.builder()
                .course(course)
                .examRoom(examRoom)
                .examTime(examTime)
                .build();
        ExamSchedule saved = examScheduleRepository.save(schedule);

        // Tự động gán toàn bộ sinh viên đang hoạt động vào danh sách dự thi (mặc định eligible = true)
        List<Student> students = studentRepository.findAll();
        for (Student st : students) {
            ExamEligibility eligibility = ExamEligibility.builder()
                    .examSchedule(saved)
                    .student(st)
                    .isEligible(true)
                    .build();
            examEligibilityRepository.save(eligibility);
        }

        return saved;
    }

    public ExamSchedule updateExamSchedule(Long id, Long courseId, String examRoom, LocalDateTime examTime) {
        ExamSchedule existing = examScheduleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy ca thi ID: " + id));
        if (courseId != null) {
            Course course = courseRepository.findById(courseId)
                    .orElseThrow(() -> new RuntimeException("Không tìm thấy môn học ID: " + courseId));
            existing.setCourse(course);
        }
        existing.setExamRoom(examRoom);
        existing.setExamTime(examTime);
        return examScheduleRepository.save(existing);
    }

    public ExamSchedule updateExamSeating(Long id, Integer seatingRows, Integer seatingCols, String disabledSeats) {
        ExamSchedule existing = examScheduleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy ca thi ID: " + id));
        if (seatingRows != null) existing.setSeatingRows(seatingRows);
        if (seatingCols != null) existing.setSeatingCols(seatingCols);
        existing.setDisabledSeats(disabledSeats);
        return examScheduleRepository.save(existing);
    }

    public void deleteExamSchedule(Long id) {
        examEligibilityRepository.deleteAll(examEligibilityRepository.findByExamScheduleId(id));
        examScheduleRepository.deleteById(id);
    }

    // --- Exam Eligibility Management ---
    public List<ExamEligibility> getExamEligibilities(Long examScheduleId) {
        return examEligibilityRepository.findByExamScheduleId(examScheduleId);
    }

    @Transactional
    public ExamEligibility toggleExamEligibility(Long examScheduleId, Long studentId, Boolean isEligible) {
        ExamEligibility eligibility = examEligibilityRepository.findByExamScheduleIdAndStudentId(examScheduleId, studentId)
                .orElseGet(() -> {
                    ExamSchedule examSchedule = examScheduleRepository.findById(examScheduleId)
                            .orElseThrow(() -> new RuntimeException("Không tìm thấy ca thi ID: " + examScheduleId));
                    Student student = studentRepository.findById(studentId)
                            .orElseThrow(() -> new RuntimeException("Không tìm thấy sinh viên ID: " + studentId));
                    return ExamEligibility.builder()
                            .examSchedule(examSchedule)
                            .student(student)
                            .isEligible(true)
                            .build();
                });
        eligibility.setIsEligible(isEligible != null ? isEligible : !Boolean.TRUE.equals(eligibility.getIsEligible()));
        return examEligibilityRepository.save(eligibility);
    }

    @Transactional
    public Map<String, Object> importExamStudents(Long examScheduleId, MultipartFile file) {
        ExamSchedule examSchedule = examScheduleRepository.findById(examScheduleId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy ca thi ID: " + examScheduleId));
                
        Map<String, Object> stats = new HashMap<>();
        int totalRows = 0;
        int importedCount = 0;
        int errorRows = 0;
        List<String> errorsList = new ArrayList<>();
        List<Student> studentsToAssign = new ArrayList<>();
        
        try (InputStream is = file.getInputStream();
             XSSFWorkbook workbook = new XSSFWorkbook(is)) {
            
            XSSFSheet sheet = workbook.getSheetAt(0);
            int rowCount = sheet.getPhysicalNumberOfRows();
            
            Set<String> processedCodes = new HashSet<>();
            
            // 1. Đọc danh sách thí sinh từ Excel
            for (int i = 1; i < rowCount; i++) {
                XSSFRow row = sheet.getRow(i);
                if (row == null) continue;
                
                String studentCode = getCellValueAsString(row.getCell(0));
                if (studentCode == null || studentCode.trim().isEmpty()) {
                    continue;
                }
                studentCode = studentCode.trim();
                
                // Bỏ qua dòng mẫu nếu trùng mã sinh viên mẫu 2310900051
                if (i == 1 && "2310900051".equals(studentCode)) {
                    continue;
                }
                
                totalRows++;
                
                if (processedCodes.contains(studentCode)) {
                    continue;
                }
                processedCodes.add(studentCode);
                
                try {
                    String fullName = getCellValueAsString(row.getCell(1));
                    String className = getCellValueAsString(row.getCell(3));
                    
                    if (fullName == null || fullName.trim().isEmpty()) {
                        fullName = "Thí sinh tự do";
                    }
                    
                    Optional<Student> studentOpt = studentRepository.findByStudentCode(studentCode);
                    Student student;
                    if (studentOpt.isPresent()) {
                        student = studentOpt.get();
                    } else {
                        student = Student.builder()
                                .studentCode(studentCode)
                                .fullName(fullName.trim())
                                .className(className != null ? className.trim() : "")
                                .status("ACTIVE")
                                .build();
                        student = studentRepository.save(student);
                    }
                    
                    studentsToAssign.add(student);
                    importedCount++;
                } catch (Exception e) {
                    errorRows++;
                    errorsList.add("Dòng " + (i + 1) + " (Mã: " + studentCode + "): " + e.getMessage());
                }
            }
            
            // 2. Xóa các quyền thi cũ
            List<ExamEligibility> oldEligibilities = examEligibilityRepository.findByExamScheduleId(examScheduleId);
            examEligibilityRepository.deleteAll(oldEligibilities);
            
            // 3. Sắp xếp chỗ ngồi tự động
            int rows = examSchedule.getSeatingRows() != null ? examSchedule.getSeatingRows() : 5;
            int cols = examSchedule.getSeatingCols() != null ? examSchedule.getSeatingCols() : 5;
            String disabledSeatsStr = examSchedule.getDisabledSeats();
            
            int currentStudentIndex = 0;
            int seatsAssigned = 0;
            
            for (int r = 0; r < rows; r++) {
                for (int c = 0; c < cols; c++) {
                    if (currentStudentIndex >= studentsToAssign.size()) {
                        break;
                    }
                    
                    String seatCoord = r + "-" + c;
                    if (disabledSeatsStr != null && (disabledSeatsStr.contains("\"" + seatCoord + "\"") || disabledSeatsStr.contains("'" + seatCoord + "'"))) {
                        continue;
                    }
                    
                    Student s = studentsToAssign.get(currentStudentIndex);
                    
                    ExamEligibility eligibility = ExamEligibility.builder()
                            .examSchedule(examSchedule)
                            .student(s)
                            .isEligible(true)
                            .seatRow(r)
                            .seatCol(c)
                            .build();
                    examEligibilityRepository.save(eligibility);
                    
                    currentStudentIndex++;
                    seatsAssigned++;
                }
                if (currentStudentIndex >= studentsToAssign.size()) {
                    break;
                }
            }
            
            int unassignedCount = 0;
            while (currentStudentIndex < studentsToAssign.size()) {
                Student s = studentsToAssign.get(currentStudentIndex);
                ExamEligibility eligibility = ExamEligibility.builder()
                        .examSchedule(examSchedule)
                        .student(s)
                        .isEligible(true)
                        .seatRow(null)
                        .seatCol(null)
                        .build();
                examEligibilityRepository.save(eligibility);
                currentStudentIndex++;
                unassignedCount++;
            }
            
            stats.put("totalRows", totalRows);
            stats.put("importedCount", importedCount);
            stats.put("seatsAssigned", seatsAssigned);
            stats.put("unassignedCount", unassignedCount);
            stats.put("errorRows", errorRows);
            stats.put("errors", errorsList);
            
        } catch (Exception e) {
            throw new RuntimeException("Lỗi nhập danh sách phòng thi: " + e.getMessage());
        }
        
        return stats;
    }
    
    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                double val = cell.getNumericCellValue();
                if (val == (long) val) {
                    return String.valueOf((long) val);
                }
                return String.valueOf(val);
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                return cell.getCellFormula();
            default:
                return "";
        }
    }
}
