package com.orbitgard.exceptions;

import com.orbitgard.dto.response.ErrorResponse;
import com.orbitgard.dto.response.FieldErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Single place that converts every error the Identity module can produce -
 * Bean Validation failures on request DTOs, and ApiExceptions thrown by
 * services - into the same problem+json ErrorResponse envelope. Controllers
 * and services never build ErrorResponse by hand.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * @NotBlank / @NotNull etc. failures on @Valid request bodies
     * (e.g. RegisterRequest). These are presence-only checks - format and
     * uniqueness failures come from ApiException instead.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex,
                                                          HttpServletRequest request) {
        List<FieldErrorResponse> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> new FieldErrorResponse(fe.getField(), ErrorCode.VALIDATION_ERROR.name()))
                .toList();

        return buildResponse(ErrorCode.VALIDATION_ERROR, "One or more fields failed validation.",
                request, fieldErrors);
    }

    /**
     * Business-rule failures thrown deliberately by services - taken
     * username, invalid phone format, and so on.
     */
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException ex, HttpServletRequest request) {
        List<FieldErrorResponse> fieldErrors = ex.getField() != null
                ? List.of(new FieldErrorResponse(ex.getField(), ex.getErrorCode().name()))
                : List.of();

        return buildResponse(ex.getErrorCode(), ex.getErrorCode().name(), request, fieldErrors);
    }

    /**
     * Anything unhandled. Never leak the raw exception message to the
     * client - log it server-side and return a generic code.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex, HttpServletRequest request) {
        return buildResponse(ErrorCode.INTERNAL_ERROR, "Something went wrong.", request, List.of());
    }

    private ResponseEntity<ErrorResponse> buildResponse(ErrorCode errorCode,
                                                        String detail,
                                                        HttpServletRequest request,
                                                        List<FieldErrorResponse> fieldErrors) {
        HttpStatus status = errorCode.getHttpStatus();

        ErrorResponse body = new ErrorResponse(
                "about:blank",              // type - placeholder; swap for a real problem-type URI if you have one
                status.getReasonPhrase(),   // title
                status.value(),             // status
                errorCode.name(),           // code
                detail,                     // detail
                request.getRequestURI(),    // instance
                OffsetDateTime.now(),       // timestamp
                UUID.randomUUID().toString(), // traceId - placeholder; swap for MDC/tracing id if you have one
                fieldErrors
        );

        return ResponseEntity.status(status).body(body);
    }
}