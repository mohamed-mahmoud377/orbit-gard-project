package com.orbitgard.validation.annotation;

import com.orbitgard.validation.validator.ValidWalletHeldValidator;
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
@Constraint(validatedBy = ValidWalletHeldValidator.class)
public @interface ValidWalletHeld {

    String message() default "WALLET_HELD_EXCEEDS_BALANCE";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
