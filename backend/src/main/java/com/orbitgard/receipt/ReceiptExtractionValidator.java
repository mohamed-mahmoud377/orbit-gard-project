package com.orbitgard.receipt;

import com.orbitgard.receipt.ReceiptExtraction;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Applies the constraints on ReceiptExtraction.
 *
 * This class exists because the annotations do nothing without it. Bean
 * Validation only runs where something invokes it — @Valid on a controller
 * parameter, or an explicit Validator call. A ReceiptExtraction is parsed
 * out of an HTTP response by Jackson, which never consults a constraint,
 * so without this the annotations are documentation and nothing more.
 *
 * A violation here means the model returned something outside the shape we
 * asked for. That is a malformed response — retryable — and never a
 * rejection the user reads. The distinction matters: a rejection is
 * terminal and costs the user their upload, while a malformed response
 * should simply be asked again.
 */
@Component
@Slf4j
public class ReceiptExtractionValidator {

    private final Validator validator;

    public ReceiptExtractionValidator(Validator validator) {
        this.validator = validator;
    }

    /** True when the extraction is well formed enough to hand to the rules. */
    public boolean isWellFormed(ReceiptExtraction extraction) {
        return violationSummary(extraction) == null;
    }

    /**
     * A short, ordered description of what was wrong, or null when nothing
     * was. Suitable for a log line: it names fields and constraint codes,
     * never values, so nobody's reference number or bank ends up in a log
     * file.
     */
    public String violationSummary(ReceiptExtraction extraction) {
        if (extraction == null) {
            return "extraction=null";
        }

        Set<ConstraintViolation<ReceiptExtraction>> violations = validator.validate(extraction);
        if (violations.isEmpty()) {
            return null;
        }

        // Sorted so the same malformed response always produces the same
        // log line — validate() returns an unordered Set.
        return violations.stream()
                .map(v -> v.getPropertyPath() + ":" + v.getMessage())
                .sorted(Comparator.naturalOrder())
                .collect(Collectors.joining(", "));
    }
}
