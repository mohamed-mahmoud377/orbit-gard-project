package com.orbitgard.validation.annotation;

import com.orbitgard.validation.validator.ValidTransactionTypeDirectionValidator;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.TYPE;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

@Documented
@Target(TYPE)
@Retention(RUNTIME)
@Constraint(validatedBy = ValidTransactionTypeDirectionValidator.class)
public @interface ValidTransactionTypeDirection {

    String message() default "INVALID_TRANSACTION_TYPE_DIRECTION";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
