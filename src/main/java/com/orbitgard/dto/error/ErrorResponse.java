package com.orbitgard.dto.error;

import lombok.Builder;
import lombok.Getter;

import java.time.OffsetDateTime;
import java.util.List;

@Getter
@Builder
public class ErrorResponse {

    private String type;
    private String title;
    private int status;
    private String code;
    private String detail;
    private String instance;
    private OffsetDateTime timestamp;
    private String traceId;
    private List<FieldError> fieldErrors;
}