package com.orbitgard.validation.annotation;

import com.orbitgard.validation.validator.ValidWalletTransactionConstraintsValidator;
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
@Constraint(validatedBy = ValidWalletTransactionConstraintsValidator.class)
public @interface ValidWalletTransactionConstraints {

    String message() default "INVALID_WALLET_TRANSACTION";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
