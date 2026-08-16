package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.UpdateChildLimitsRequest;
import com.orbitgard.dto.response.ChildTransactionPageResponse;
import com.orbitgard.dto.response.FamilyChildDetailResponse;
import com.orbitgard.dto.response.FamilyChildResponse;
import com.orbitgard.dto.response.FieldErrorResponse;
import com.orbitgard.dto.response.FamilyOverviewResponse;
import com.orbitgard.entity.SpendingLimit;
import com.orbitgard.entity.User;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.AccountType;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.exceptions.ValidationException;
import com.orbitgard.mapper.FamilyMapper;
import com.orbitgard.repository.SpendingLimitRepository;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.repository.WalletRepository;
import com.orbitgard.repository.WalletTransactionRepository;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.FamilyService;
import com.orbitgard.wallet.MoneyConverter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Family tab reads.
 *
 * Day and month windows are cut in UTC, exactly as
 * ChildSpendingLimitServiceImpl cuts them when it enforces the limits. That
 * is deliberate: if this service used local time, a parent could see a
 * progress bar that disagrees with the ceiling the API actually applied.
 *
 * Nothing here writes. Every figure is derived from wallet, spending_limit,
 * and wallet_transaction rows that the existing transfer and payment flows
 * already produce.
 */
@Service
@Slf4j
public class FamilyServiceImpl implements FamilyService {

    private final UserRepository userRepository;
    private final WalletRepository walletRepository;
    private final SpendingLimitRepository spendingLimitRepository;
    private final WalletTransactionRepository walletTransactionRepository;
    private final AuthenticatedUserService authenticatedUserService;
    private final FamilyMapper familyMapper;

    public FamilyServiceImpl(UserRepository userRepository,
                             WalletRepository walletRepository,
                             SpendingLimitRepository spendingLimitRepository,
                             WalletTransactionRepository walletTransactionRepository,
                             AuthenticatedUserService authenticatedUserService,
                             FamilyMapper familyMapper) {
        this.userRepository = userRepository;
        this.walletRepository = walletRepository;
        this.spendingLimitRepository = spendingLimitRepository;
        this.walletTransactionRepository = walletTransactionRepository;
        this.authenticatedUserService = authenticatedUserService;
        this.familyMapper = familyMapper;
    }

    // =========================================================================
    // GET /family/overview
    // =========================================================================

    @Override
    @Transactional(readOnly = true)
    public FamilyOverviewResponse getOverview() {
        User parent = requireParent();
        List<User> children = userRepository.findByParent_IdOrderByCreatedAtAsc(parent.getId());

        if (children.isEmpty()) {
            // Short-circuit: the set-wide queries below would emit IN () .
            return new FamilyOverviewResponse(
                    0,
                    MoneyConverter.centsToMajor(0),
                    MoneyConverter.centsToMajor(0),
                    0L);
        }

        List<UUID> childWalletIds = walletsByUserId(children).values().stream()
                .map(Wallet::getId)
                .toList();

        UUID parentWalletId = walletRepository.findByUserId(parent.getId())
                .orElseThrow(() -> new NoSuchElementException("Wallet not found for user: " + parent.getId()))
                .getId();

        OffsetDateTime monthStart = startOfMonthUtc();
        OffsetDateTime monthEnd = monthStart.plusMonths(1);

        long allocatedCents = walletTransactionRepository.sumCompletedAllocationsFromParentBetween(
                childWalletIds, parentWalletId, monthStart, monthEnd);
        long spentCents = walletTransactionRepository.sumCompletedDebitsForWalletsBetween(
                childWalletIds, monthStart, monthEnd);
        long blockedAttempts = walletTransactionRepository.countRejectedForWalletsBetween(
                childWalletIds, monthStart, monthEnd);

        return new FamilyOverviewResponse(
                children.size(),
                MoneyConverter.centsToMajor(allocatedCents),
                MoneyConverter.centsToMajor(spentCents),
                blockedAttempts);
    }

    // =========================================================================
    // GET /family/children
    // =========================================================================

    @Override
    @Transactional(readOnly = true)
    public List<FamilyChildResponse> listChildren() {
        User parent = requireParent();
        List<User> children = userRepository.findByParent_IdOrderByCreatedAtAsc(parent.getId());

        if (children.isEmpty()) {
            return List.of();
        }

        Map<UUID, Wallet> walletsByUserId = walletsByUserId(children);

        OffsetDateTime dayStart = startOfDayUtc();
        OffsetDateTime dayEnd = dayStart.plusDays(1);
        OffsetDateTime monthStart = startOfMonthUtc();
        OffsetDateTime monthEnd = monthStart.plusMonths(1);

        List<FamilyChildResponse> cards = new ArrayList<>(children.size());
        for (User child : children) {
            Wallet wallet = walletsByUserId.get(child.getId());
            if (wallet == null) {
                throw new NoSuchElementException("Wallet not found for user: " + child.getId());
            }

            // Every CHILD gets a SpendingLimit row in the same transaction
            // that creates it (AuthServiceImpl#addChild), so a miss here is
            // real data corruption, not an expected empty state.
            SpendingLimit limit = spendingLimitRepository.findByUser_Id(child.getId())
                    .orElseThrow(() -> new NoSuchElementException(
                            "CHILD account has no SpendingLimit row: " + child.getId()));

            // Same sums ChildSpendingLimitServiceImpl checks against.
            long spentTodayCents = walletTransactionRepository.sumCompletedDebitsBetween(
                    wallet.getId(), dayStart, dayEnd);
            long spentThisMonthCents = walletTransactionRepository.sumCompletedDebitsBetween(
                    wallet.getId(), monthStart, monthEnd);

            cards.add(familyMapper.toChildResponse(child, wallet, limit, spentTodayCents, spentThisMonthCents));
        }

        return cards;
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** The authenticated user, rejected unless it is a parent-capable USER account. */
    private User requireParent() {
        UUID userId = authenticatedUserService.currentPrincipal().userId();

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));

        if (user.getAccountType() != AccountType.USER) {
            log.warn("Child account attempted to read the family view. userId={}", userId);
            throw new ApiException(ErrorCode.ACCESS_DENIED);
        }

        return user;
    }

    private Map<UUID, Wallet> walletsByUserId(List<User> children) {
        List<UUID> childIds = children.stream().map(User::getId).toList();
        return walletRepository.findByUserIdIn(childIds).stream()
                .collect(Collectors.toMap(Wallet::getUserId, Function.identity()));
    }

    private OffsetDateTime startOfDayUtc() {
        return OffsetDateTime.now(ZoneOffset.UTC)
                .toLocalDate()
                .atStartOfDay(ZoneOffset.UTC)
                .toOffsetDateTime();
    }

    private OffsetDateTime startOfMonthUtc() {
        return OffsetDateTime.now(ZoneOffset.UTC)
                .toLocalDate()
                .withDayOfMonth(1)
                .atStartOfDay(ZoneOffset.UTC)
                .toOffsetDateTime();
    }

    // =========================================================================
    // GET /family/children/{childId}
    // =========================================================================

    @Override
    @Transactional(readOnly = true)
    public FamilyChildDetailResponse getChild(UUID childId) {
        User parent = requireParent();
        User child = requireOwnChild(parent, childId);
        return assembleDetail(parent, child);
    }

    // =========================================================================
    // PATCH /family/children/{childId}/limits
    // =========================================================================

    @Override
    @Transactional
    public FamilyChildDetailResponse updateChildLimits(UUID childId, UpdateChildLimitsRequest request) {
        // requireParent already rejects CHILD callers with 403 — a child must
        // never be able to raise their own ceilings.
        User parent = requireParent();
        User child = requireOwnChild(parent, childId);

        SpendingLimit limit = requireLimit(child.getId());

        if (request.maxPerTransaction() == null
                && request.dailyLimit() == null
                && request.monthlyLimit() == null) {
            throw new ValidationException(List.of(
                    new FieldErrorResponse("limits", ErrorCode.FIELD_REQUIRED.name())));
        }

        // Merge first, validate second: omitted fields keep their stored value,
        // so raising one ceiling in isolation is still checked against the two
        // it has to sit between.
        BigDecimal maxPerTransaction = request.maxPerTransaction() != null
                ? request.maxPerTransaction() : limit.getMaxPerTransaction();
        BigDecimal dailyLimit = request.dailyLimit() != null
                ? request.dailyLimit() : limit.getDailyLimit();
        BigDecimal monthlyLimit = request.monthlyLimit() != null
                ? request.monthlyLimit() : limit.getMonthlyLimit();

        // Same ordering rule and same field attribution as
        // AuthServiceImpl#addChild, and the same rule chk_spending_limit_order
        // enforces in V12 — so a rejection here never becomes a 500 at flush.
        List<FieldErrorResponse> errors = new ArrayList<>();
        if (maxPerTransaction.compareTo(dailyLimit) > 0) {
            errors.add(new FieldErrorResponse("dailyLimit", ErrorCode.LIMIT_ORDER_INVALID.name()));
        }
        if (dailyLimit.compareTo(monthlyLimit) > 0) {
            errors.add(new FieldErrorResponse("monthlyLimit", ErrorCode.LIMIT_ORDER_INVALID.name()));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }

        limit.setMaxPerTransaction(maxPerTransaction);
        limit.setDailyLimit(dailyLimit);
        limit.setMonthlyLimit(monthlyLimit);
        spendingLimitRepository.save(limit);

        log.info("Child spending limits updated. childId={}, parentId={}", child.getId(), parent.getId());

        // Lowering a ceiling below what is already spent is deliberately
        // allowed — it stops further spending without rewriting history. The
        // mapper floors `remaining` at zero for exactly this case.
        return assembleDetail(parent, child);
    }

    // =========================================================================
    // GET /family/children/{childId}/transactions
    // =========================================================================

    @Override
    @Transactional(readOnly = true)
    public ChildTransactionPageResponse listChildTransactions(UUID childId, int page, int size) {
        User parent = requireParent();
        User child = requireOwnChild(parent, childId);
        Wallet wallet = requireWallet(child.getId());

        // Newest first: a parent opening a child's activity wants the last
        // thing that happened, not the first. The ascending query stays
        // reserved for the ledger-chain view.
        Page<WalletTransaction> transactions = walletTransactionRepository
                .findByWalletIdOrderByCreatedAtDesc(wallet.getId(), PageRequest.of(page, size));

        return new ChildTransactionPageResponse(
                transactions.getContent().stream()
                        .map(familyMapper::toChildTransactionResponse)
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
    // Shared assembly
    // =========================================================================

    private FamilyChildDetailResponse assembleDetail(User parent, User child) {
        Wallet wallet = requireWallet(child.getId());
        SpendingLimit limit = requireLimit(child.getId());

        OffsetDateTime dayStart = startOfDayUtc();
        OffsetDateTime monthStart = startOfMonthUtc();

        long spentTodayCents = walletTransactionRepository.sumCompletedDebitsBetween(
                wallet.getId(), dayStart, dayStart.plusDays(1));
        long spentThisMonthCents = walletTransactionRepository.sumCompletedDebitsBetween(
                wallet.getId(), monthStart, monthStart.plusMonths(1));

        UUID parentWalletId = requireWallet(parent.getId()).getId();
        long allocatedThisMonthCents = walletTransactionRepository
                .sumCompletedAllocationsFromParentBetween(
                        List.of(wallet.getId()), parentWalletId, monthStart, monthStart.plusMonths(1));

        return familyMapper.toChildDetailResponse(
                child, wallet, limit, spentTodayCents, spentThisMonthCents, allocatedThisMonthCents);
    }

    /**
     * Loads a child that belongs to this parent, or 404s.
     *
     * Ownership is enforced in the query, and a child owned by someone else
     * produces the same RESOURCE_NOT_FOUND as an id that does not exist —
     * a parent must not be able to probe for other households' child ids.
     */
    private User requireOwnChild(User parent, UUID childId) {
        User child = userRepository.findByIdAndParent_Id(childId, parent.getId())
                .orElseThrow(() -> new ApiException(ErrorCode.RESOURCE_NOT_FOUND));

        if (child.getAccountType() != AccountType.CHILD) {
            throw new ApiException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        return child;
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