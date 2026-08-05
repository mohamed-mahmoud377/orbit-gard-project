package com.orbitgard.exceptions;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;

/** Writes the standard API error body from filters that run before MVC. */
@Component
public class ApiProblemResponseWriter {

    private final ObjectMapper objectMapper;

    public ApiProblemResponseWriter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void write(HttpServletRequest request, HttpServletResponse response,
                      ErrorCode errorCode, String detail) throws IOException {
        response.setStatus(errorCode.getHttpStatus().value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(),
                ApiProblemResponseFactory.create(errorCode, detail, request.getRequestURI(), List.of()));
    }
}
