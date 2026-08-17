package com.orbitgard.mapper;

import com.orbitgard.dto.response.ChildDailyWindowResponse;
import com.orbitgard.dto.response.ChildMonthlyWindowResponse;
import com.orbitgard.dto.response.ChildPendingItemResponse;
import com.orbitgard.dto.response.ChildTransactionResponse;
import com.orbitgard.dto.response.ChildWalletResponse;
import com.orbitgard.entity.SpendingLimit;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.wallet.MoneyConverter;
import com.orbitgard.wallet.PeriodWindows;
import org.springframework.stereotype.Component;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Assembles the child's own wallet screen.
 *
 * Transaction rows are delegated to FamilyMapper rather than re-mapped here:
 * the parent's feed and the child's feed are the same shape by design, and
 * two copies would drift the first time one is changed.
 */
@Component
public class ChildSelfMapper {

    private static final String DAILY_RESET_LABEL = "midnight";
    private static final DateTimeFormatter HOUR_MINUTE = DateTimeFormatter.ofPattern("HH:mm");

    private final FamilyMapper familyMapper;

    public ChildSelfMapper(FamilyMapper familyMapper) {
        this.familyMapper = familyMapper;
    }

    public ChildWalletResponse toWalletResponse(Wallet wallet,
                                                SpendingLimit limit,
                                                long spentTodayCents,
                                                long spentThisMonthCents,
                                                List<WalletTransaction> pending,
                                                List<WalletTransaction> recentActivity) {
        return new ChildWalletResponse(
                MoneyConverter.centsToMajor(wallet.getAvailableCents()),
                MoneyConverter.centsToMajor(wallet.getBalanceCents()),
                MoneyConverter.centsToMajor(wallet.getHeldCents()),
                new ChildDailyWindowResponse(
                        MoneyConverter.centsToMajor(spentTodayCents),
                        limit.getDailyLimit(),
                        LimitWindows.remaining(spentTodayCents, limit.getDailyLimit()),
                        DAILY_RESET_LABEL),
                new ChildMonthlyWindowResponse(
                        MoneyConverter.centsToMajor(spentThisMonthCents),
                        limit.getMonthlyLimit(),
                        LimitWindows.remaining(spentThisMonthCents, limit.getMonthlyLimit()),
                        // The NEXT reset, not the window's start: "resetsOn"
                        // reads as a future date on the child's screen.
                        PeriodWindows.endOfMonthUtc().toLocalDate()),
                limit.getMaxPerTransaction(),
                pending.stream().map(this::toPendingItem).toList(),
                recentActivity.stream().map(familyMapper::toChildTransactionResponse).toList()
        );
    }

    private ChildPendingItemResponse toPendingItem(WalletTransaction transaction) {
        return new ChildPendingItemResponse(
                transaction.getId(),
                familyMapper.toChildTransactionResponse(transaction).merchant(),
                MoneyConverter.centsToMajor(transaction.getAmountCents()),
                transaction.getCreatedAt()
                        .withOffsetSameInstant(ZoneOffset.UTC)
                        .format(HOUR_MINUTE)
        );
    }

    /** Exposed so the paged activity endpoint maps rows the same way. */
    public ChildTransactionResponse toTransactionResponse(WalletTransaction transaction) {
        return familyMapper.toChildTransactionResponse(transaction);
    }
}
