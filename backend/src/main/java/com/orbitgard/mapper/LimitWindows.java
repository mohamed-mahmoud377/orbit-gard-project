package com.orbitgard.mapper;

import com.orbitgard.dto.response.LimitWindowResponse;
import com.orbitgard.wallet.MoneyConverter;

import java.math.BigDecimal;

/**
 * Builds the spent/max/remaining triple shared by the parent's child-detail
 * view and the child's own wallet view.
 *
 * Remaining is floored at zero. A parent may lower a ceiling below what has
 * already been spent in the window — that is allowed, and simply means no
 * further spending until the window rolls. It must never surface as a
 * negative number the UI would render as a backwards progress bar.
 */
public final class LimitWindows {

    private LimitWindows() {
    }

    public static LimitWindowResponse of(long spentCents, BigDecimal maxMajor) {
        long remainingCents = Math.max(0, MoneyConverter.majorToCents(maxMajor) - spentCents);
        return new LimitWindowResponse(
                MoneyConverter.centsToMajor(spentCents),
                maxMajor,
                MoneyConverter.centsToMajor(remainingCents));
    }

    /** Just the remaining figure, for shapes that carry their own window record. */
    public static BigDecimal remaining(long spentCents, BigDecimal maxMajor) {
        return MoneyConverter.centsToMajor(
                Math.max(0, MoneyConverter.majorToCents(maxMajor) - spentCents));
    }
}
