package com.orbitgard.service.Impl;

import com.orbitgard.entity.SpendingLimit;
import com.orbitgard.entity.User;
import com.orbitgard.enums.AccountType;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.repository.SpendingLimitRepository;
import com.orbitgard.repository.WalletTransactionRepository;
import com.orbitgard.service.ChildSpendingLimitService;
import com.orbitgard.wallet.MoneyConverter;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class ChildSpendingLimitServiceImpl implements ChildSpendingLimitService {

    private final SpendingLimitRepository spendingLimitRepository;
    private final WalletTransactionRepository walletTransactionRepository;

    public ChildSpendingLimitServiceImpl(SpendingLimitRepository spendingLimitRepository,
                                         WalletTransactionRepository walletTransactionRepository) {
        this.spendingLimitRepository = spendingLimitRepository;
        this.walletTransactionRepository = walletTransactionRepository;
    }

    @Override
    public void enforceIfChild(User sender, UUID senderWalletId, long amountCents) {
        if (sender.getAccountType() != AccountType.CHILD) {
            return;
        }

        SpendingLimit limit = spendingLimitRepository.findByUser_Id(sender.getId())
                .orElseThrow(() -> new NoSuchElementException(
                        "CHILD account has no SpendingLimit row: " + sender.getId()));

        long maxPerTransactionCents = MoneyConverter.majorToCents(limit.getMaxPerTransaction());
        long dailyLimitCents = MoneyConverter.majorToCents(limit.getDailyLimit());
        long monthlyLimitCents = MoneyConverter.majorToCents(limit.getMonthlyLimit());

        if (amountCents > maxPerTransactionCents) {
            throw new ApiException(ErrorCode.MAX_PER_TRANSACTION_EXCEEDED, "amount");
        }

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        OffsetDateTime startOfDay = now.toLocalDate().atStartOfDay(ZoneOffset.UTC).toOffsetDateTime();
        OffsetDateTime startOfNextDay = startOfDay.plusDays(1);
        long spentToday = walletTransactionRepository.sumCompletedDebitsBetween(
                senderWalletId, startOfDay, startOfNextDay);
        if (spentToday + amountCents > dailyLimitCents) {
            throw new ApiException(ErrorCode.DAILY_LIMIT_EXCEEDED, "amount");
        }

        OffsetDateTime startOfMonth = now.toLocalDate().withDayOfMonth(1).atStartOfDay(ZoneOffset.UTC).toOffsetDateTime();
        OffsetDateTime startOfNextMonth = startOfMonth.plusMonths(1);
        long spentThisMonth = walletTransactionRepository.sumCompletedDebitsBetween(
                senderWalletId, startOfMonth, startOfNextMonth);
        if (spentThisMonth + amountCents > monthlyLimitCents) {
            throw new ApiException(ErrorCode.MONTHLY_LIMIT_EXCEEDED, "amount");
        }
    }
}