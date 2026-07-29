package com.orbitgard.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public abstract class ApiException extends RuntimeException {

    private final String errorCode;
    private final HttpStatus httpStatus;
    private final String title;

    protected ApiException(String errorCode, HttpStatus httpStatus, String title, String message) {
        super(message);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
        this.title = title;
    }
}