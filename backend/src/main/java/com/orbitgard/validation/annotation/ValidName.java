package com.orbitgard.validation.annotation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.ANNOTATION_TYPE;
import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

@Documented
@Target({FIELD, PARAMETER, ANNOTATION_TYPE})
@Retention(RUNTIME)
@Constraint(validatedBy = {})
@NotBlank(message = "FIELD_REQUIRED")
@Size(
        max = 30,
        message = "NAME_INVALID"
)
@Pattern(
        regexp = "^[A-Za-z]+([ '\\-][A-Za-z]+)*$",
        message = "NAME_INVALID"
)
public @interface ValidName {

    String message() default "NAME_INVALID";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}