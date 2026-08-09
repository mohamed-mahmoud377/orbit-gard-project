package com.orbitgard.mapper;

import com.orbitgard.dto.response.WalletBalanceResponse;
import com.orbitgard.dto.response.WalletTransactionResponse;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.wallet.MoneyConverter;
import org.springframework.stereotype.Component;

@Component
public class WalletMapper {

    public WalletBalanceResponse toBalanceResponse(Wallet wallet) {
        return new WalletBalanceResponse(
                MoneyConverter.centsToMajor(wallet.getBalanceCents()),
                MoneyConverter.centsToMajor(wallet.getHeldCents()),
                MoneyConverter.centsToMajor(wallet.getAvailableCents())
        );
    }

    public WalletTransactionResponse toTransactionResponse(WalletTransaction transaction) {
        return new WalletTransactionResponse(
                transaction.getId(),
                transaction.getType(),
                transaction.getDirection(),
                transaction.getStatus(),
                MoneyConverter.centsToMajor(transaction.getAmountCents()),
                MoneyConverter.centsToMajor(transaction.getBalanceBeforeCents()),
                MoneyConverter.centsToMajor(transaction.getBalanceAfterCents()),
                transaction.getReference(),
                transaction.getTransactionPublicId(),
                transaction.getDescription(),
                transaction.getCounterparty(),
                transaction.getCreatedAt(),
                transaction.getResolvedAt()
        );
    }
}
