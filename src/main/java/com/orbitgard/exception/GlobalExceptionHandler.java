package com.orbitgard.exception;

import com.orbitgard.dto.error.ErrorResponse;
import com.orbitgard.dto.error.FieldError;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final String TYPE_BASE = "https://orbit.local/errors/";

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException ex, HttpServletRequest request) {
        ErrorResponse body = ErrorResponse.builder()
                .type(TYPE_BASE + ex.getErrorCode().toLowerCase().replace('_', '-'))
                .title(ex.getTitle())
                .status(ex.getHttpStatus().value())
                .code(ex.getErrorCode())
                .detail(ex.getMessage())
                .instance(request.getRequestURI())
                .timestamp(OffsetDateTime.now())
                .traceId(generateTraceId())
                .build();
        return ResponseEntity.status(ex.getHttpStatus()).body(body);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<FieldError> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> new FieldError(fe.getField(), "VALIDATION_ERROR"))
                .toList();

        ErrorResponse body = ErrorResponse.builder()
                .type(TYPE_BASE + "validation-error")
                .title("Validation failed")
                .status(HttpStatus.BAD_REQUEST.value())
                .code("VALIDATION_ERROR")
                .detail("One or more fields failed validation.")
                .instance(request.getRequestURI())
                .timestamp(OffsetDateTime.now())
                .traceId(generateTraceId())
                .fieldErrors(fieldErrors)
                .build();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpectedException(Exception ex, HttpServletRequest request) {
        ErrorResponse body = ErrorResponse.builder()
                .type(TYPE_BASE + "internal-error")
                .title("Something went wrong")
                .status(HttpStatus.INTERNAL_SERVER_ERROR.value())
                .code("INTERNAL_ERROR")
                .detail("Something went wrong. Please try again later.")
                .instance(request.getRequestURI())
                .timestamp(OffsetDateTime.now())
                .traceId(generateTraceId())
                .build();
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }
    @ExceptionHandler(RateLimitedException.class)
    public ResponseEntity<ErrorResponse> handleRateLimited(RateLimitedException ex, HttpServletRequest request) {
        ErrorResponse body = ErrorResponse.builder()
                .type("https://orbit.local/errors/rate-limited")
                .title(ex.getTitle())
                .status(ex.getHttpStatus().value())
                .code(ex.getErrorCode())
                .detail(ex.getMessage())
                .instance(request.getRequestURI())
                .timestamp(OffsetDateTime.now())
                .traceId(generateTraceId())
                .build();
        return ResponseEntity.status(ex.getHttpStatus()).body(body);
    }

    private String generateTraceId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}