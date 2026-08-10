package com.orbitgard.scheduler;

import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.TransactionStatus;
import com.orbitgard.repository.WalletTransactionRepository;
import com.orbitgard.service.WalletTransactionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Slf4j
public class PendingCreditResolutionJob {

    private final WalletTransactionRepository walletTransactionRepository;
    private final WalletTransactionService walletTransactionService;

    public PendingCreditResolutionJob(WalletTransactionRepository walletTransactionRepository,
                                      WalletTransactionService walletTransactionService) {
        this.walletTransactionRepository = walletTransactionRepository;
        this.walletTransactionService = walletTransactionService;
    }

    @Scheduled(fixedRate = 3, timeUnit = java.util.concurrent.TimeUnit.HOURS)
    public void resolvePendingCredits() {
        List<WalletTransaction> pending = walletTransactionRepository.findByStatus(TransactionStatus.PENDING);
        if (pending.isEmpty()) {
            return;
        }

        log.info("Pending credit resolution job: found {} pending transaction(s)", pending.size());
        for (WalletTransaction transaction : pending) {
            try {
                walletTransactionService.completePendingCredit(transaction.getId());
            } catch (Exception ex) {
                log.error("Failed to resolve pending transaction {}", transaction.getId(), ex);
            }
        }
    }
}
