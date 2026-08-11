package com.orbitgard.validation.validator;

import com.orbitgard.entity.Wallet;
import com.orbitgard.validation.annotation.ValidWalletHeld;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class ValidWalletHeldValidator implements ConstraintValidator<ValidWalletHeld, Wallet> {

    @Override
    public void initialize(ValidWalletHeld constraintAnnotation) {
    }

    @Override
    public boolean isValid(Wallet wallet, ConstraintValidatorContext context) {
        if (wallet == null) {
            return true;
        }

        boolean isValid = wallet.getHeldCents() <= wallet.getBalanceCents();

        if (!isValid) {
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate(context.getDefaultConstraintMessageTemplate())
                    .addPropertyNode("heldCents")
                    .addConstraintViolation();
        }

        return isValid;
    }
}
