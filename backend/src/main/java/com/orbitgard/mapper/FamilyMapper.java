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
import com.orbitgard.enums.TransactionType;
import com.orbitgard.wallet.MoneyConverter;
import com.orbitgard.wallet.TransactionDescriptions;
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

    /** Delegates to the shared helper so the child view cannot drift from this one. */
    private LimitWindowResponse window(long spentCents, BigDecimal maxMajor) {
        return LimitWindows.of(spentCents, maxMajor);
    }

    public ChildTransactionResponse toChildTransactionResponse(WalletTransaction transaction) {
        return new ChildTransactionResponse(
                transaction.getId(),
                merchantOf(transaction),
                transaction.getReference(),
                channelOf(transaction.getType()),
                // Amount stays positive exactly as the ledger stores it; the
                // caller reads `direction` instead of inspecting a sign. A
                // signed amount forces every consumer to re-derive direction
                // from it, and gets it wrong the moment a zero appears.
                transaction.getDirection(),
                MoneyConverter.centsToMajor(transaction.getAmountCents()),
                transaction.getStatus(),
                // Parsed off the end of the description, where the recorder
                // appends it. Null for any row that was not blocked.
                TransactionDescriptions.blockedReasonOf(transaction.getDescription()),
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
     * Delegates external-payment parsing to TransactionDescriptions, which
     * owns both halves of the format. It strips any blocked suffix before
     * looking for the merchant marker, so an appended reason never leaks
     * into the merchant name.
     */
    private String merchantOf(WalletTransaction transaction) {
        return switch (transaction.getType()) {
            case EXTERNAL_TRANSFER -> TransactionDescriptions.merchantOf(transaction.getDescription());
            case INTERNAL_TRANSFER -> transaction.getCounterparty() == null
                    ? null
                    : "@" + transaction.getCounterparty();
            case TOPUP -> "Wallet top-up";
            case PROMO -> "Promotional bonus";
        };
    }
}