package com.attendance.service;

import com.attendance.dto.StudentDTO;
import com.attendance.model.Student;
import com.attendance.repository.StudentRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class StudentService {

    private final StudentRepository studentRepository;
    private final AiClientService aiClientService;
    private final ObjectMapper objectMapper;

    public List<StudentDTO> getAllStudents() {
        return studentRepository.findAll().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public StudentDTO getStudentByCode(String studentCode) {
        Student student = studentRepository.findByStudentCode(studentCode)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy sinh viên có mã: " + studentCode));
        return toDTO(student);
    }

    public Student createStudent(Student student) {
        if (studentRepository.existsByStudentCode(student.getStudentCode())) {
            throw new RuntimeException("Mã sinh viên " + student.getStudentCode() + " đã tồn tại!");
        }
        return studentRepository.save(student);
    }

    public Student updateStudent(Long id, Student updated) {
        Student existing = studentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy sinh viên ID: " + id));
        existing.setFullName(updated.getFullName());
        existing.setDateOfBirth(updated.getDateOfBirth());
        existing.setClassName(updated.getClassName());
        existing.setStatus(updated.getStatus());
        return studentRepository.save(existing);
    }

    public void deleteStudent(Long id) {
        studentRepository.deleteById(id);
    }

    @Transactional
    public Student registerFace(String studentCode, String base64Image) {
        Student student = studentRepository.findByStudentCode(studentCode)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy sinh viên có mã: " + studentCode));

        List<Double> embedding = aiClientService.extractEmbedding(base64Image);
        if (embedding == null || embedding.isEmpty()) {
            throw new RuntimeException("Không thể trích xuất vector khuôn mặt. Vui lòng thử lại với ảnh rõ nét hơn.");
        }

        try {
            String jsonEmbedding = objectMapper.writeValueAsString(embedding);
            student.setFaceEmbedding(jsonEmbedding);
            return studentRepository.save(student);
        } catch (Exception e) {
            throw new RuntimeException("Lỗi lưu trữ vector khuôn mặt: " + e.getMessage());
        }
    }

    public List<Map<String, Object>> getCandidatesForRecognition() {
        List<Student> studentsWithFaces = studentRepository.findByFaceEmbeddingIsNotNull();
        List<Map<String, Object>> candidates = new ArrayList<>();

        for (Student s : studentsWithFaces) {
            try {
                String str = s.getFaceEmbedding();
                if (str != null && !str.isBlank()) {
                    List<Double> vec = null;
                    String trimmed = str.trim();
                    if (trimmed.startsWith("[")) {
                        vec = objectMapper.readValue(trimmed, new TypeReference<List<Double>>() {});
                    } else {
                        byte[] bytes = str.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
                        if (bytes.length == 2048) {
                            java.nio.FloatBuffer fb = java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN).asFloatBuffer();
                            vec = new ArrayList<>(512);
                            while (fb.hasRemaining()) {
                                vec.add((double) fb.get());
                            }
                        }
                    }
                    if (vec != null && vec.size() == 512) {
                        Map<String, Object> candidate = new HashMap<>();
                        candidate.put("student_code", s.getStudentCode());
                        candidate.put("embedding", vec);
                        candidates.add(candidate);
                    }
                }
            } catch (Exception e) {
                log.warn("Error parsing embedding for student {}: {}", s.getStudentCode(), e.getMessage());
            }
        }
        return candidates;
    }

    private StudentDTO toDTO(Student student) {
        return StudentDTO.builder()
                .id(student.getId())
                .studentCode(student.getStudentCode())
                .fullName(student.getFullName())
                .dateOfBirth(student.getDateOfBirth())
                .className(student.getClassName())
                .hasFaceRegistered(student.getFaceEmbedding() != null && !student.getFaceEmbedding().isBlank())
                .status(student.getStatus())
                .build();
    }

    public byte[] exportTemplate() {
        try (XSSFWorkbook workbook = new XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            
            XSSFSheet sheet = workbook.createSheet("Danh sách sinh viên mẫu");
            
            // Header row
            XSSFRow header = sheet.createRow(0);
            String[] columns = {"Mã sinh viên", "Họ và tên", "Ngày sinh (YYYY-MM-DD)", "Lớp", "Trạng thái (ACTIVE/INACTIVE)"};
            
            for (int i = 0; i < columns.length; i++) {
                XSSFCell cell = header.createCell(i);
                cell.setCellValue(columns[i]);
            }
            
            // Sample row
            XSSFRow row1 = sheet.createRow(1);
            row1.createCell(0).setCellValue("2310900051");
            row1.createCell(1).setCellValue("Nguyễn Công Tùng");
            row1.createCell(2).setCellValue("2005-06-15");
            row1.createCell(3).setCellValue("K23CNT3");
            row1.createCell(4).setCellValue("ACTIVE");
            
            // Auto size columns
            for (int i = 0; i < columns.length; i++) {
                sheet.autoSizeColumn(i);
            }
            
            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Lỗi xuất tệp mẫu Excel: " + e.getMessage());
        }
    }

    @Transactional
    public Map<String, Object> importStudents(MultipartFile file) {
        Map<String, Object> stats = new HashMap<>();
        int totalRows = 0;
        int importedCount = 0;
        int skippedCount = 0;
        int errorRows = 0;
        List<String> errorsList = new ArrayList<>();
        
        try (InputStream is = file.getInputStream();
             XSSFWorkbook workbook = new XSSFWorkbook(is)) {
            
            XSSFSheet sheet = workbook.getSheetAt(0);
            int rowCount = sheet.getPhysicalNumberOfRows();
            
            Set<String> processedCodes = new HashSet<>();
            
            // Bắt đầu từ dòng thứ 1 (bỏ qua tiêu đề ở dòng 0)
            for (int i = 1; i < rowCount; i++) {
                XSSFRow row = sheet.getRow(i);
                if (row == null) continue;
                
                // Đọc mã sinh viên
                String studentCode = getCellValueAsString(row.getCell(0));
                if (studentCode == null || studentCode.trim().isEmpty()) {
                    continue; // bỏ qua dòng trống hoặc ko có mã
                }
                studentCode = studentCode.trim();
                
                // Bỏ qua dòng ví dụ mẫu đầu tiên nếu là dữ liệu mẫu
                if (i == 1 && "2310900051".equals(studentCode)) {
                    continue;
                }
                
                totalRows++;
                
                // Lọc trùng trong chính file excel hoặc trong DB
                if (processedCodes.contains(studentCode) || studentRepository.existsByStudentCode(studentCode)) {
                    skippedCount++;
                    processedCodes.add(studentCode);
                    continue;
                }
                
                try {
                    String fullName = getCellValueAsString(row.getCell(1));
                    String dobStr = getCellValueAsString(row.getCell(2));
                    String className = getCellValueAsString(row.getCell(3));
                    String status = getCellValueAsString(row.getCell(4));
                    
                    if (fullName == null || fullName.trim().isEmpty()) {
                        throw new RuntimeException("Thiếu họ và tên");
                    }
                    if (dobStr == null || dobStr.trim().isEmpty()) {
                        throw new RuntimeException("Thiếu ngày sinh");
                    }
                    
                    // Parse date
                    LocalDate dob = parseDate(dobStr, row.getCell(2));
                    
                    Student student = Student.builder()
                            .studentCode(studentCode)
                            .fullName(fullName.trim())
                            .dateOfBirth(dob)
                            .className(className != null ? className.trim() : "")
                            .status(status != null && !status.trim().isEmpty() ? status.trim().toUpperCase() : "ACTIVE")
                            .build();
                            
                    studentRepository.save(student);
                    importedCount++;
                    processedCodes.add(studentCode);
                } catch (Exception e) {
                    errorRows++;
                    errorsList.add("Dòng " + (i + 1) + " (Mã: " + studentCode + "): " + e.getMessage());
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Lỗi nhập dữ liệu từ Excel: " + e.getMessage());
        }
        
        stats.put("totalRows", totalRows);
        stats.put("importedCount", importedCount);
        stats.put("skippedCount", skippedCount);
        stats.put("errorRows", errorRows);
        stats.put("errors", errorsList);
        return stats;
    }
    
    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getLocalDateTimeCellValue().toLocalDate().toString();
                }
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
    
    private LocalDate parseDate(String dobStr, Cell cell) {
        try {
            if (cell != null && cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
                return cell.getLocalDateTimeCellValue().toLocalDate();
            }
            return LocalDate.parse(dobStr.trim(), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        } catch (Exception e) {
            try {
                return LocalDate.parse(dobStr.trim(), DateTimeFormatter.ofPattern("dd/MM/yyyy"));
            } catch (Exception ex) {
                throw new RuntimeException("Định dạng ngày sinh không hợp lệ (yêu cầu YYYY-MM-DD hoặc DD/MM/YYYY)");
            }
        }
    }
}
