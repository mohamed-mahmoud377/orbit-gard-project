package com.orbitgard.validation.validator;

import com.orbitgard.dto.request.RecordTransactionRequest;
import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionType;
import com.orbitgard.validation.annotation.ValidTransactionTypeDirection;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class ValidTransactionTypeDirectionValidator 
        implements ConstraintValidator<ValidTransactionTypeDirection, RecordTransactionRequest> {

    @Override
    public void initialize(ValidTransactionTypeDirection constraintAnnotation) {
    }

    @Override
    public boolean isValid(RecordTransactionRequest request, ConstraintValidatorContext context) {
        if (request == null || request.type() == null || request.direction() == null) {
            return true;
        }

        boolean isValid = isValidTypeDirectionCombination(request.type(), request.direction());

        if (!isValid) {
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate(context.getDefaultConstraintMessageTemplate())
                    .addPropertyNode("direction")
                    .addConstraintViolation();
        }

        return isValid;
    }

    private boolean isValidTypeDirectionCombination(TransactionType type, TransactionDirection direction) {
        return switch (type) {
            case PROMO, TOPUP -> direction == TransactionDirection.CREDIT;
            case EXTERNAL_TRANSFER -> direction == TransactionDirection.DEBIT;
            case INTERNAL_TRANSFER -> true;
        };
    }
}
