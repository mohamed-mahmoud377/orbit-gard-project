package com.orbitgard.exceptions;

import com.orbitgard.dto.response.ErrorResponse;
import com.orbitgard.dto.response.FieldErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;
import java.util.NoSuchElementException;

import jakarta.validation.ConstraintViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Single place that converts every error the Identity module can produce -
 * Bean Validation failures on request DTOs, and ApiExceptions thrown by
 * services - into the same problem+json ErrorResponse envelope. Controllers
 * and services never build ErrorResponse by hand.
 */
@RestControllerAdvice
@Slf4j
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
                .map(fe -> FieldErrorResponse.builder()
                        .field(fe.getField())
                        .code(fe.getDefaultMessage())
                        .build())
                .toList();

        return buildResponse(ErrorCode.FIELD_REQUIRED, "One or more required fields are missing.",
                request, fieldErrors);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotAllowed(HttpRequestMethodNotSupportedException ex,
                                                                  HttpServletRequest request) {
        return buildResponse(ErrorCode.METHOD_NOT_ALLOWED, "This HTTP method is not supported for the requested resource.", request, List.of());
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleUnsupportedMediaType(HttpMediaTypeNotSupportedException ex,
                                                                      HttpServletRequest request) {
        return buildResponse(ErrorCode.UNSUPPORTED_MEDIA_TYPE, "Use a supported Content-Type for this request.", request, List.of());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleMalformedRequest(HttpMessageNotReadableException ex,
                                                                  HttpServletRequest request) {
        return buildResponse(ErrorCode.MALFORMED_REQUEST, "The request body is missing or malformed.", request, List.of());
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingParameter(MissingServletRequestParameterException ex,
                                                                  HttpServletRequest request) {
        return buildResponse(ErrorCode.MISSING_REQUEST_PARAMETER,
                "Required request parameter '" + ex.getParameterName() + "' is missing.", request, List.of());
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class, ConstraintViolationException.class})
    public ResponseEntity<ErrorResponse> handleInvalidParameter(Exception ex, HttpServletRequest request) {
        return buildResponse(ErrorCode.INVALID_REQUEST_PARAMETER, "A request parameter has an invalid value.", request, List.of());
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class, NoSuchElementException.class})
    public ResponseEntity<ErrorResponse> handleNotFound(Exception ex, HttpServletRequest request) {
        return buildResponse(ErrorCode.RESOURCE_NOT_FOUND, "The requested resource was not found.", request, List.of());
    }

    /**
     * Business-rule failures thrown deliberately by services - taken
     * username, invalid phone format, and so on.
     */
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException ex, HttpServletRequest request) {
        List<FieldErrorResponse> fieldErrors = ex.getField() != null
                ? List.of(FieldErrorResponse.builder()
                        .field(ex.getField())
                        .code(ex.getErrorCode().name())
                        .build())
                : List.of();

        return buildResponse(ex.getErrorCode(), ex.getErrorCode().name(), request, fieldErrors);
    }

    /**
     * Validation failures that contain every invalid field discovered during
     * service-level validation.
     */
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex,
                                                                    HttpServletRequest request) {
        return buildResponse(ErrorCode.VALIDATION_ERROR, "One or more fields failed validation.",
                request, ex.getFieldErrors());
    }

    /**
     * Anything unhandled. Never leak the raw exception message to the
     * client - log it server-side and return a generic code.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Unhandled request failure method={} path={}", request.getMethod(), request.getRequestURI(), ex);
        return buildResponse(ErrorCode.INTERNAL_ERROR, "Something went wrong.", request, List.of());
    }

    private ResponseEntity<ErrorResponse> buildResponse(ErrorCode errorCode,
                                                        String detail,
                                                        HttpServletRequest request,
                                                        List<FieldErrorResponse> fieldErrors) {
        HttpStatus status = errorCode.getHttpStatus();

        ErrorResponse body = ApiProblemResponseFactory.create(errorCode, detail, request.getRequestURI(), fieldErrors);

        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(body);
    }
}
