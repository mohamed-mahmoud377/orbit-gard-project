package com.orbitgard.service.Impl;

import com.orbitgard.dto.response.ChildActivitySummaryResponse;
import com.orbitgard.dto.response.ChildTransactionPageResponse;
import com.orbitgard.dto.response.ChildWalletResponse;
import com.orbitgard.entity.SpendingLimit;
import com.orbitgard.entity.User;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.mapper.ChildSelfMapper;
import com.orbitgard.repository.SpendingLimitRepository;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.repository.WalletRepository;
import com.orbitgard.repository.WalletTransactionRepository;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.ChildSelfService;
import com.orbitgard.wallet.MoneyConverter;
import com.orbitgard.wallet.PeriodWindows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Self-scoped reads for a CHILD account.
 *
 * The authorization model here is structural rather than checked: no method
 * takes an id, so the wallet resolved is always the principal's own. There is
 * no parameter a child could tamper with to reach a sibling.
 *
 * Every figure reuses the same repository queries the parent view and
 * ChildSpendingLimitServiceImpl use, over the same UTC windows from
 * PeriodWindows. A child and their parent must never see different numbers
 * for the same wallet, and enforcement must never disagree with either.
 */
@Service
@Slf4j
public class ChildSelfServiceImpl implements ChildSelfService {

    /** Rows on the wallet screen's recent-activity strip. */
    private static final int RECENT_ACTIVITY_LIMIT = 5;

    private final UserRepository userRepository;
    private final WalletRepository walletRepository;
    private final SpendingLimitRepository spendingLimitRepository;
    private final WalletTransactionRepository walletTransactionRepository;
    private final AuthenticatedUserService authenticatedUserService;
    private final ChildSelfMapper childSelfMapper;

    public ChildSelfServiceImpl(UserRepository userRepository,
                                WalletRepository walletRepository,
                                SpendingLimitRepository spendingLimitRepository,
                                WalletTransactionRepository walletTransactionRepository,
                                AuthenticatedUserService authenticatedUserService,
                                ChildSelfMapper childSelfMapper) {
        this.userRepository = userRepository;
        this.walletRepository = walletRepository;
        this.spendingLimitRepository = spendingLimitRepository;
        this.walletTransactionRepository = walletTransactionRepository;
        this.authenticatedUserService = authenticatedUserService;
        this.childSelfMapper = childSelfMapper;
    }

    // =========================================================================
    // GET /child/wallet
    // =========================================================================

    @Override
    @Transactional(readOnly = true)
    public ChildWalletResponse getOwnWallet() {
        User child = requireChild();
        Wallet wallet = requireWallet(child.getId());
        SpendingLimit limit = requireLimit(child.getId());

        OffsetDateTime dayStart = PeriodWindows.startOfDayUtc();
        OffsetDateTime monthStart = PeriodWindows.startOfMonthUtc();

        long spentTodayCents = walletTransactionRepository.sumCompletedDebitsBetween(
                wallet.getId(), dayStart, PeriodWindows.endOfDayUtc());
        long spentThisMonthCents = walletTransactionRepository.sumCompletedDebitsBetween(
                wallet.getId(), monthStart, PeriodWindows.endOfMonthUtc());

        List<WalletTransaction> pending = walletTransactionRepository
                .findByWalletIdAndStatusOrderByCreatedAtDesc(wallet.getId(), TransactionStatus.PENDING);

        List<WalletTransaction> recentActivity = walletTransactionRepository
                .findByWalletIdOrderByCreatedAtDesc(wallet.getId(),
                        PageRequest.of(0, RECENT_ACTIVITY_LIMIT))
                .getContent();

        return childSelfMapper.toWalletResponse(
                wallet, limit, spentTodayCents, spentThisMonthCents, pending, recentActivity);
    }

    // =========================================================================
    // GET /child/activity/summary
    // =========================================================================

    @Override
    @Transactional(readOnly = true)
    public ChildActivitySummaryResponse getOwnActivitySummary() {
        User child = requireChild();
        Wallet wallet = requireWallet(child.getId());

        OffsetDateTime dayStart = PeriodWindows.startOfDayUtc();
        OffsetDateTime monthStart = PeriodWindows.startOfMonthUtc();
        OffsetDateTime monthEnd = PeriodWindows.endOfMonthUtc();

        long spentTodayCents = walletTransactionRepository.sumCompletedDebitsBetween(
                wallet.getId(), dayStart, PeriodWindows.endOfDayUtc());
        long spentThisMonthCents = walletTransactionRepository.sumCompletedDebitsBetween(
                wallet.getId(), monthStart, monthEnd);

        // Every COMPLETED credit, whatever its source — a parent transfer, a
        // top-up, or a promo. Reuses the query behind the wallet summary
        // rather than adding a fourth near-identical one.
        long receivedThisMonthCents = walletTransactionRepository
                .sumAmountCentsByWalletAndDirectionAndStatusAndPeriod(
                        wallet.getId(), TransactionDirection.CREDIT, TransactionStatus.COMPLETED,
                        monthStart, monthEnd);

        // REJECTED is the only durable signal for a refused transaction, and
        // nothing currently writes it — limit violations throw without
        // persisting. This reads 0 until blocked-attempt recording exists.
        long blockedCount = walletTransactionRepository.countByWalletAndStatusAndPeriod(
                wallet.getId(), TransactionStatus.REJECTED, monthStart, monthEnd);

        return new ChildActivitySummaryResponse(
                MoneyConverter.centsToMajor(spentTodayCents),
                MoneyConverter.centsToMajor(spentThisMonthCents),
                MoneyConverter.centsToMajor(receivedThisMonthCents),
                blockedCount);
    }

    // =========================================================================
    // GET /child/transactions
    // =========================================================================

    @Override
    @Transactional(readOnly = true)
    public ChildTransactionPageResponse listOwnTransactions(int page, int size) {
        User child = requireChild();
        Wallet wallet = requireWallet(child.getId());

        Page<WalletTransaction> transactions = walletTransactionRepository
                .findByWalletIdOrderByCreatedAtDesc(wallet.getId(), PageRequest.of(page, size));

        return new ChildTransactionPageResponse(
                transactions.getContent().stream()
                        .map(childSelfMapper::toTransactionResponse)
                        .toList(),
                transactions.getNumber(),
                transactions.getSize(),
                transactions.getTotalElements(),
                transactions.getTotalPages(),
                transactions.isFirst(),
                transactions.isLast()
        );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * The authenticated user, rejected unless it is a CHILD account.
     *
     * A parent has no SpendingLimit row, so these screens have nothing to
     * show them — the parent-side equivalents live under /family.
     */
    private User requireChild() {
        UUID userId = authenticatedUserService.currentPrincipal().userId();

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));

        if (user.getAccountType() != AccountType.CHILD) {
            log.warn("Non-child account attempted to read the child self view. userId={}", userId);
            throw new ApiException(ErrorCode.ACCESS_DENIED);
        }

        return user;
    }

    private Wallet requireWallet(UUID userId) {
        return walletRepository.findByUserId(userId)
                .orElseThrow(() -> new NoSuchElementException("Wallet not found for user: " + userId));
    }

    private SpendingLimit requireLimit(UUID childId) {
        return spendingLimitRepository.findByUser_Id(childId)
                .orElseThrow(() -> new NoSuchElementException(
                        "CHILD account has no SpendingLimit row: " + childId));
    }
}
