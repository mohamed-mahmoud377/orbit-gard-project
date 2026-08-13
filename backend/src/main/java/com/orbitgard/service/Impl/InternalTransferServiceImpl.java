package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.InternalTransferRequest;
import com.orbitgard.dto.request.RecordTransactionRequest;
import com.orbitgard.dto.response.InternalTransferResponse;
import com.orbitgard.entity.User;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionType;
import com.orbitgard.enums.UserStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.repository.WalletRepository;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.InternalTransferService;
import com.orbitgard.service.WalletTransactionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class InternalTransferServiceImpl implements InternalTransferService {

    private static final BigDecimal MIN_AMOUNT = new BigDecimal("0.01");
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("100000.00");

    private final UserRepository userRepository;
    private final WalletRepository walletRepository;
    private final WalletTransactionService walletTransactionService;
    private final AuthenticatedUserService authenticatedUserService;

    public InternalTransferServiceImpl(UserRepository userRepository,
                                       WalletRepository walletRepository,
                                       WalletTransactionService walletTransactionService,
                                       AuthenticatedUserService authenticatedUserService) {
        this.userRepository = userRepository;
        this.walletRepository = walletRepository;
        this.walletTransactionService = walletTransactionService;
        this.authenticatedUserService = authenticatedUserService;
    }

    @Override
    @Transactional
    public InternalTransferResponse transfer(InternalTransferRequest request) {
        if (request.amount() == null || request.amount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ApiException(ErrorCode.AMOUNT_INVALID, "amount");
        }
        if (request.amount().compareTo(MIN_AMOUNT) < 0) {
            throw new ApiException(ErrorCode.AMOUNT_BELOW_MINIMUM, "amount");
        }
        if (request.amount().compareTo(MAX_AMOUNT) > 0) {
            throw new ApiException(ErrorCode.AMOUNT_ABOVE_MAXIMUM, "amount");
        }

        String senderUsername = authenticatedUserService.currentUsername();
        String receiverUsername = request.receiverUsername().trim().toLowerCase();

        if (receiverUsername.equals(senderUsername)) {
            throw new ApiException(ErrorCode.SELF_TRANSFER_NOT_ALLOWED, "receiverUsername");
        }

        UUID senderId = authenticatedUserService.currentPrincipal().userId();
        User sender = userRepository.findById(senderId)
                .orElseThrow(() -> new NoSuchElementException("Sender not found: " + senderId));
        User receiver = userRepository.findByUsername(receiverUsername)
                .orElseThrow(() -> new ApiException(ErrorCode.RECEIVER_NOT_FOUND, "receiverUsername"));

        if (receiver.getStatus() == UserStatus.SUSPENDED) {
            throw new ApiException(ErrorCode.ACCOUNT_SUSPENDED, "receiverUsername");
        }
        if (receiver.getStatus() != UserStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ACCOUNT_NOT_VERIFIED, "receiverUsername");
        }

        long amountCents = toMinorUnits(request.amount());

        UUID senderWalletId = walletRepository.findByUserId(senderId)
                .orElseThrow(() -> new NoSuchElementException("Sender wallet not found: " + senderId))
                .getId();
        UUID receiverWalletId = walletRepository.findByUserId(receiver.getId())
                .orElseThrow(() -> new NoSuchElementException("Receiver wallet not found: " + receiver.getId()))
                .getId();

        UUID firstId = senderWalletId.compareTo(receiverWalletId) <= 0 ? senderWalletId : receiverWalletId;
        UUID secondId = firstId.equals(senderWalletId) ? receiverWalletId : senderWalletId;

        Wallet first = walletRepository.findByIdForUpdate(firstId).orElseThrow();
        Wallet second = walletRepository.findByIdForUpdate(secondId).orElseThrow();

        Wallet senderWallet = firstId.equals(senderWalletId) ? first : second;
        Wallet receiverWallet = firstId.equals(senderWalletId) ? second : first;

        if (senderWallet.getAvailableCents() < amountCents) {
            throw new ApiException(ErrorCode.INSUFFICIENT_BALANCE);
        }
        UUID debitId = UUID.randomUUID();
        UUID creditId = UUID.randomUUID();

        WalletTransaction debit = walletTransactionService.record(RecordTransactionRequest.builder()
                .id(debitId)
                .walletId(senderWallet.getId())
                .type(TransactionType.INTERNAL_TRANSFER)
                .direction(TransactionDirection.DEBIT)
                .amountCents(amountCents)
                .description("Transfer to @" + receiver.getUsername())
                .counterparty(receiver.getUsername())
                .counterpartyWalletId(receiverWallet.getId())
                .relatedTransactionId(creditId)
                .build());


        WalletTransaction credit = walletTransactionService.record(RecordTransactionRequest.builder()
                .id(creditId)
                .walletId(receiverWallet.getId())
                .type(TransactionType.INTERNAL_TRANSFER)
                .direction(TransactionDirection.CREDIT)
                .amountCents(amountCents)
                .description("Transfer from @" + senderUsername)
                .counterparty(senderUsername)
                .counterpartyWalletId(senderWallet.getId())
                .relatedTransactionId(debitId)
                .build());


        return new InternalTransferResponse(
                debit.getId(), debit.getReference(),
                credit.getId(), credit.getReference(),
                debit.getStatus().name());
    }

    private long toMinorUnits(BigDecimal amount) {
        try {
            return amount.setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact();
        } catch (ArithmeticException e) {
            throw new ApiException(ErrorCode.AMOUNT_INVALID, "amount");
        }
    }
}