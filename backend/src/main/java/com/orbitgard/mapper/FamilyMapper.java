package com.orbitgard.mapper;

import com.orbitgard.dto.response.ChildTransactionResponse;
import com.orbitgard.dto.response.FamilyChildDetailLimitsResponse;
import com.orbitgard.dto.response.FamilyChildDetailResponse;
import com.orbitgard.dto.response.FamilyChildLimitsResponse;
import com.orbitgard.dto.response.FamilyChildResponse;
import com.orbitgard.dto.response.LimitProgressResponse;
import com.orbitgard.dto.response.LimitWindowResponse;
import com.orbitgard.entity.SpendingLimit;
import com.orbitgard.entity.User;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionType;
import com.orbitgard.wallet.MoneyConverter;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Assembles the child-card payload for the parent's Family tab.
 *
 * The spent figures are passed in rather than looked up here — they come
 * from the same WalletTransactionRepository sums that
 * ChildSpendingLimitServiceImpl enforces against, so the progress bars and
 * the enforcement can never disagree about a window.
 */
@Component
public class FamilyMapper {

    private static final String EXTERNAL_MERCHANT_MARKER = " From: ";

    public FamilyChildResponse toChildResponse(User child,
                                               Wallet wallet,
                                               SpendingLimit limit,
                                               long spentTodayCents,
                                               long spentThisMonthCents) {
        return new FamilyChildResponse(
                child.getId(),
                child.getFirstName() + " " + child.getLastName(),
                "@" + child.getUsername(),
                child.getStatus(),
                MoneyConverter.centsToMajor(wallet.getAvailableCents()),
                MoneyConverter.centsToMajor(wallet.getBalanceCents()),
                MoneyConverter.centsToMajor(wallet.getHeldCents()),
                new FamilyChildLimitsResponse(
                        new LimitProgressResponse(
                                MoneyConverter.centsToMajor(spentTodayCents),
                                limit.getDailyLimit()),
                        new LimitProgressResponse(
                                MoneyConverter.centsToMajor(spentThisMonthCents),
                                limit.getMonthlyLimit()),
                        limit.getMaxPerTransaction()
                )
        );
    }


    public FamilyChildDetailResponse toChildDetailResponse(User child,
                                                           Wallet wallet,
                                                           SpendingLimit limit,
                                                           long spentTodayCents,
                                                           long spentThisMonthCents,
                                                           long allocatedThisMonthCents) {
        return new FamilyChildDetailResponse(
                child.getId(),
                child.getFirstName() + " " + child.getLastName(),
                "@" + child.getUsername(),
                child.getStatus(),
                wallet.getCreatedAt() == null ? null : wallet.getCreatedAt().toLocalDate(),
                MoneyConverter.centsToMajor(wallet.getAvailableCents()),
                MoneyConverter.centsToMajor(wallet.getBalanceCents()),
                MoneyConverter.centsToMajor(wallet.getHeldCents()),
                MoneyConverter.centsToMajor(allocatedThisMonthCents),
                new FamilyChildDetailLimitsResponse(
                        window(spentTodayCents, limit.getDailyLimit()),
                        window(spentThisMonthCents, limit.getMonthlyLimit()),
                        limit.getMaxPerTransaction()
                )
        );
    }

    /**
     * Remaining is floored at zero. A parent may lower a ceiling below what
     * the child has already spent in the window — that is allowed, and simply
     * means no further spending until the window rolls. It must not surface
     * as a negative number the UI would render as a backwards progress bar.
     */
    private LimitWindowResponse window(long spentCents, BigDecimal maxMajor) {
        long maxCents = MoneyConverter.majorToCents(maxMajor);
        long remainingCents = Math.max(0, maxCents - spentCents);
        return new LimitWindowResponse(
                MoneyConverter.centsToMajor(spentCents),
                maxMajor,
                MoneyConverter.centsToMajor(remainingCents));
    }

    public ChildTransactionResponse toChildTransactionResponse(WalletTransaction transaction) {
        // The ledger always stores a positive amount and carries the sign in
        // `direction`. The parent's feed wants it signed for display.
        long signedCents = transaction.getDirection() == TransactionDirection.DEBIT
                ? -transaction.getAmountCents()
                : transaction.getAmountCents();

        return new ChildTransactionResponse(
                transaction.getId(),
                merchantOf(transaction),
                transaction.getReference(),
                channelOf(transaction.getType()),
                MoneyConverter.centsToMajor(signedCents),
                transaction.getStatus(),
                // No rejection reason is persisted anywhere in the schema, so
                // this is null rather than invented — the UI shows nothing
                // instead of something misleading.
                null,
                transaction.getCreatedAt()
        );
    }

    /** Maps a transaction type back to the flow that produced it. */
    private String channelOf(TransactionType type) {
        return switch (type) {
            case EXTERNAL_TRANSFER -> "/pay";
            case INTERNAL_TRANSFER -> "/transfer";
            case TOPUP -> "/topup";
            case PROMO -> "/promo";
        };
    }

    /**
     * ExternalPaymentServiceImpl deliberately never persists merchantName in
     * a column — it only lands inside the description, in the fixed form
     * "External payment: Bought {product} From: {merchant}". Parsing it back
     * out is the only way to show a merchant today.
     *
     * Returns null rather than a partial string when the marker is absent, so
     * a hand-written or future-format description degrades to blank instead
     * of to garbage. A real merchant column would remove this method.
     */
    private String merchantOf(WalletTransaction transaction) {
        String description = transaction.getDescription();

        return switch (transaction.getType()) {
            case EXTERNAL_TRANSFER -> {
                if (description == null) {
                    yield null;
                }
                int marker = description.lastIndexOf(EXTERNAL_MERCHANT_MARKER);
                if (marker < 0) {
                    yield null;
                }
                String merchant = description.substring(marker + EXTERNAL_MERCHANT_MARKER.length()).trim();
                yield merchant.isEmpty() ? null : merchant;
            }
            case INTERNAL_TRANSFER -> transaction.getCounterparty() == null
                    ? null
                    : "@" + transaction.getCounterparty();
            case TOPUP -> "Wallet top-up";
            case PROMO -> "Promotional bonus";
        };
    }
}