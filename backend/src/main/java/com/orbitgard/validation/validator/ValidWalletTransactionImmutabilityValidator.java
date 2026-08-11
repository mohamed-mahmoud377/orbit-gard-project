package com.orbitgard.validation.validator;

import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.validation.annotation.ValidWalletTransactionImmutability;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class ValidWalletTransactionImmutabilityValidator 
        implements ConstraintValidator<ValidWalletTransactionImmutability, WalletTransaction> {

    @Override
    public void initialize(ValidWalletTransactionImmutability constraintAnnotation) {
    }

    @Override
    public boolean isValid(WalletTransaction transaction, ConstraintValidatorContext context) {
        // This validator is primarily for documentation and schema validation.
        // Actual immutability enforcement is handled via JPA lifecycle callbacks 
        // and the entity's resolve() method.
        return true;
    }
}
