package com.orbitgard.validation.validator;

import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionStatus;
import com.orbitgard.enums.TransactionType;
import com.orbitgard.validation.annotation.ValidWalletTransactionConstraints;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class ValidWalletTransactionConstraintsValidator 
        implements ConstraintValidator<ValidWalletTransactionConstraints, WalletTransaction> {

    @Override
    public void initialize(ValidWalletTransactionConstraints constraintAnnotation) {
    }

    @Override
    public boolean isValid(WalletTransaction transaction, ConstraintValidatorContext context) {
        if (transaction == null) {
            return true;
        }

        context.disableDefaultConstraintViolation();
        boolean isValid = true;

        // Validate type-direction relationship
        if (!isValidTypeDirectionCombination(transaction.getType(), transaction.getDirection())) {
            context.buildConstraintViolationWithTemplate("Invalid type-direction combination")
                    .addPropertyNode("direction")
                    .addConstraintViolation();
            isValid = false;
        }

        // Validate status-resolved_at relationship
        if (!isValidStatusResolution(transaction.getStatus(), transaction.getResolvedAt())) {
            context.buildConstraintViolationWithTemplate("Invalid status-resolved_at combination")
                    .addPropertyNode("resolvedAt")
                    .addConstraintViolation();
            isValid = false;
        }

        return isValid;
    }

    private boolean isValidTypeDirectionCombination(TransactionType type, TransactionDirection direction) {
        if (type == null || direction == null) {
            return true;
        }

        return switch (type) {
            case PROMO, TOPUP -> direction == TransactionDirection.CREDIT;
            case EXTERNAL_TRANSFER -> direction == TransactionDirection.DEBIT;
            case INTERNAL_TRANSFER -> true;
        };
    }

    private boolean isValidStatusResolution(TransactionStatus status, java.time.OffsetDateTime resolvedAt) {
        if (status == null) {
            return true;
        }

        return switch (status) {
            case PENDING -> resolvedAt == null;
            case COMPLETED, REJECTED -> true;
        };
    }
}
