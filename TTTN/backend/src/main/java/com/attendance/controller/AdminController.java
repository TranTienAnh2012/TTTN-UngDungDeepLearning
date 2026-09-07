package com.attendance.controller;

import com.attendance.dto.ApiResponse;
import com.attendance.dto.LoginRequest;
import com.attendance.dto.LoginResponse;
import com.attendance.model.Administrator;
import com.attendance.repository.AdministratorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AdminController {

    private final AdministratorRepository administratorRepository;

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(@RequestBody LoginRequest request) {
        if (request.getUsername() == null || request.getPassword() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Vui lòng cung cấp tài khoản và mật khẩu"));
        }

        Optional<Administrator> adminOpt = administratorRepository.findByUsername(request.getUsername());

        if (adminOpt.isPresent()) {
            Administrator admin = adminOpt.get();
            // So sánh mật khẩu trực tiếp (theo dữ liệu hạt giống plain-text)
            if (admin.getPassword().equals(request.getPassword())) {
                LoginResponse response = LoginResponse.builder()
                        .success(true)
                        .message("Đăng nhập thành công")
                        .username(admin.getUsername())
                        .fullName(admin.getFullName())
                        .build();
                return ResponseEntity.ok(ApiResponse.ok("Đăng nhập thành công", response));
            }
        }

        return ResponseEntity.status(401).body(ApiResponse.error("Tài khoản hoặc mật khẩu không chính xác"));
    }
}
