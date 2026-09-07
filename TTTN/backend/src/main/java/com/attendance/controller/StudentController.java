package com.attendance.controller;

import com.attendance.dto.ApiResponse;
import com.attendance.dto.FaceRegisterRequest;
import com.attendance.dto.StudentDTO;
import com.attendance.model.Student;
import com.attendance.service.StudentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/students")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class StudentController {

    private final StudentService studentService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<StudentDTO>>> getAllStudents() {
        return ResponseEntity.ok(ApiResponse.ok(studentService.getAllStudents()));
    }

    @GetMapping("/{studentCode}")
    public ResponseEntity<ApiResponse<StudentDTO>> getStudentByCode(@PathVariable String studentCode) {
        return ResponseEntity.ok(ApiResponse.ok(studentService.getStudentByCode(studentCode)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Student>> createStudent(@RequestBody Student student) {
        return ResponseEntity.ok(ApiResponse.ok("Thêm sinh viên thành công", studentService.createStudent(student)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Student>> updateStudent(@PathVariable Long id, @RequestBody Student student) {
        return ResponseEntity.ok(ApiResponse.ok("Cập nhật thành công", studentService.updateStudent(id, student)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<String>> deleteStudent(@PathVariable Long id) {
        studentService.deleteStudent(id);
        return ResponseEntity.ok(ApiResponse.ok("Xóa sinh viên thành công", null));
    }

    @PostMapping("/register-face")
    public ResponseEntity<ApiResponse<StudentDTO>> registerFace(@RequestBody FaceRegisterRequest request) {
        if (request.getStudentCode() == null || request.getImage() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Thiếu mã sinh viên hoặc ảnh chụp"));
        }
        studentService.registerFace(request.getStudentCode(), request.getImage());
        StudentDTO dto = studentService.getStudentByCode(request.getStudentCode());
        return ResponseEntity.ok(ApiResponse.ok("Đăng ký khuôn mặt thành công cho sinh viên " + dto.getFullName(), dto));
    }

    @GetMapping("/excel/template")
    public ResponseEntity<byte[]> getExcelTemplate() {
        byte[] data = studentService.exportTemplate();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=mau_nhap_sinh_vien.xlsx")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(data);
    }

    @PostMapping("/excel/import")
    public ResponseEntity<ApiResponse<Map<String, Object>>> importStudentsFromExcel(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Vui lòng tải lên tệp tin Excel"));
        }
        Map<String, Object> result = studentService.importStudents(file);
        return ResponseEntity.ok(ApiResponse.ok("Nhập danh sách sinh viên từ Excel thành công", result));
    }
}
