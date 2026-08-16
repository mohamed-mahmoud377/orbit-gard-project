package com.orbitgard.mapper;

import com.orbitgard.dto.response.FamilyChildLimitsResponse;
import com.orbitgard.dto.response.FamilyChildResponse;
import com.orbitgard.dto.response.LimitProgressResponse;
import com.orbitgard.entity.SpendingLimit;
import com.orbitgard.entity.User;
import com.orbitgard.entity.Wallet;
import com.orbitgard.wallet.MoneyConverter;
import org.springframework.stereotype.Component;

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
}
