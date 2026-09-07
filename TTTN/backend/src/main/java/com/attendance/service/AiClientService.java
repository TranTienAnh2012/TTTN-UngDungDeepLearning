package com.attendance.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.*;

@Service
@Slf4j
public class AiClientService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${ai.service.url:http://127.0.0.1:5000/api/ai}")
    private String aiServiceUrl;

    @Value("${ai.service.threshold:0.45}")
    private double defaultThreshold;

    public AiClientService(RestTemplateBuilder restTemplateBuilder, ObjectMapper objectMapper) {
        this.restTemplate = restTemplateBuilder
                .setConnectTimeout(Duration.ofSeconds(5))
                .setReadTimeout(Duration.ofSeconds(15))
                .build();
        this.objectMapper = objectMapper;
    }

    /**
     * Call Python AI to extract face embedding from base64 image
     */
    public List<Double> extractEmbedding(String base64Image) {
        try {
            String url = aiServiceUrl + "/register";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, String> requestBody = new HashMap<>();
            requestBody.put("image", base64Image);

            HttpEntity<Map<String, String>> request = new HttpEntity<>(requestBody, headers);
            ResponseEntity<Map> response = restTemplate.postForEntity(url, request, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map body = response.getBody();
                Boolean success = (Boolean) body.get("success");
                if (Boolean.TRUE.equals(success)) {
                    List<?> embeddingRaw = (List<?>) body.get("embedding");
                    List<Double> embedding = new ArrayList<>();
                    for (Object val : embeddingRaw) {
                        if (val instanceof Number) {
                            embedding.add(((Number) val).doubleValue());
                        }
                    }
                    return embedding;
                }
            }
        } catch (org.springframework.web.client.HttpStatusCodeException e) {
            log.warn("AI Service returned status {}: {}", e.getStatusCode(), e.getResponseBodyAsString());
            try {
                Map<?, ?> errMap = objectMapper.readValue(e.getResponseBodyAsString(), Map.class);
                String msg = (String) errMap.get("message");
                throw new RuntimeException(msg != null ? msg : "Không tìm thấy khuôn mặt rõ ràng trong ảnh.");
            } catch (Exception ex) {
                throw new RuntimeException("Không tìm thấy khuôn mặt rõ ràng trong ảnh chụp.");
            }
        } catch (Exception e) {
            log.error("Failed to extract embedding from AI service: {}", e.getMessage());
            throw new RuntimeException(e.getMessage());
        }
        return null;
    }

    /**
     * Call Python AI to recognize face from candidates
     */
    public Map<String, Object> recognizeFace(String base64Image, List<Map<String, Object>> candidates, Double threshold) {
        try {
            String url = aiServiceUrl + "/recognize";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("image", base64Image);
            requestBody.put("candidates", candidates);
            requestBody.put("threshold", threshold != null ? threshold : defaultThreshold);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);
            ResponseEntity<Map> response = restTemplate.postForEntity(url, request, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return (Map<String, Object>) response.getBody();
            }
        } catch (Exception e) {
            log.error("Failed to recognize face from AI service: {}", e.getMessage());
            Map<String, Object> errResult = new HashMap<>();
            errResult.put("matched", false);
            errResult.put("message", "Lỗi kết nối AI Service: " + e.getMessage());
            return errResult;
        }

        Map<String, Object> failResult = new HashMap<>();
        failResult.put("matched", false);
        failResult.put("message", "Không nhận diện được khuôn mặt");
        return failResult;
    }
}
