package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.ExternalPayRequest;
import com.orbitgard.dto.request.ExternalVerifyRequest;
import com.orbitgard.dto.request.RecordTransactionRequest;
import com.orbitgard.dto.response.ExternalPayResponse;
import com.orbitgard.dto.response.ExternalVerifyResponse;
import com.orbitgard.entity.User;
import com.orbitgard.entity.VerificationToken;
import com.orbitgard.entity.Wallet;
import com.orbitgard.entity.WalletTransaction;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.TokenPurpose;
import com.orbitgard.enums.TransactionDirection;
import com.orbitgard.enums.TransactionType;
import com.orbitgard.enums.UserStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.repository.VerificationTokenRepository;
import com.orbitgard.security.JwtService;
import com.orbitgard.service.ExternalPaymentService;
import com.orbitgard.service.WalletService;
import com.orbitgard.service.WalletTransactionService;
import com.orbitgard.util.TokenHasher;
import com.orbitgard.validation.PhoneNumberNormalizer;
import com.orbitgard.validation.UsernameNormalizer;
import com.orbitgard.wallet.MoneyConverter;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

/**
 * ORB external-payment flow:
 *
 * 1) POST /external/verify -- merchant forwards the shopper's username and
 *    password. We authenticate exactly like AuthServiceImpl#login (same
 *    constant-time dummy-hash comparison, same ACTIVE-only
 *    rules) but never open a session. Instead we mint a one-hour, one-time
 *    VerificationToken with purpose EXTERNAL_PAYMENT, the same way
 *    AuthServiceImpl mints an EMAIL_VERIFICATION token.
 *
 * 2) POST /external/pay -- merchant resends the token together with
 *    merchant name, product name, and amount. We redeem the token (purpose
 *    check, ownership check, one-time-use check, expiry check -- mirroring
 *    AuthServiceImpl#verifyEmail), then debit the shopper's wallet through
 *    WalletTransactionService#record using type EXTERNAL_TRANSFER, which
 *    TransactionRules already restricts to DIRECTION=DEBIT.
 *
 * merchantName is intentionally never persisted anywhere (no column, no
 * entity, no counterparty write) -- it is only echoed back in the response
 * for the merchant's own confirmation/receipt.
 */
@Service
public class ExternalPaymentServiceImpl implements ExternalPaymentService {


    private static final String DUMMY_PASSWORD_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    private static final long TOKEN_VALIDITY_HOURS = 1;

    private final UserRepository userRepository;
    private final VerificationTokenRepository verificationTokenRepository;
    private final WalletService walletService;
    private final WalletTransactionService walletTransactionService;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public ExternalPaymentServiceImpl(UserRepository userRepository,
                                      VerificationTokenRepository verificationTokenRepository,
                                      WalletService walletService,
                                      WalletTransactionService walletTransactionService,
                                      PasswordEncoder passwordEncoder,
                                      JwtService jwtService) {
        this.userRepository = userRepository;
        this.verificationTokenRepository = verificationTokenRepository;
        this.walletService = walletService;
        this.walletTransactionService = walletTransactionService;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    // =========================================================================
    // Step 1: /external/verify
    // =========================================================================

    @Override
    @Transactional
    public ExternalVerifyResponse verify(ExternalVerifyRequest request) {
        String identifier = UsernameNormalizer.normalize(request.username());
        Optional<User> userLookup = userRepository.findByUsername(identifier);

        // Always compare against BCrypt, including when no account exists,
        // to avoid making account existence observable through response
        // timing (same reasoning as AuthServiceImpl#login).
        boolean passwordMatches = passwordEncoder.matches(
                request.password(), userLookup.map(User::getPasswordHash).orElse(DUMMY_PASSWORD_HASH));

        if (userLookup.isEmpty() || !passwordMatches) {
            throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
        }

        User user = userLookup.get();
        if (user.getStatus() == UserStatus.PENDING_VERIFICATION) {
            throw new ApiException(ErrorCode.ACCOUNT_NOT_VERIFIED);
        }
        if (user.getStatus() == UserStatus.SUSPENDED) {
            throw new ApiException(ErrorCode.ACCOUNT_SUSPENDED);
        }

        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusHours(TOKEN_VALIDITY_HOURS);
        String rawToken = jwtService.mintExternalPaymentToken(user.getId(), user.getUsername(), expiresAt.toInstant());

        VerificationToken token = new VerificationToken();
        token.setUserId(user.getId());
        token.setTokenHash(TokenHasher.sha256Hex(rawToken));
        token.setPurpose(TokenPurpose.EXTERNAL_TRANSFER);
        // targetEmail is NOT NULL on this table; USER accounts always carry
        // one (only CHILD accounts have a null email), and it is never used
        // for outbound mail here -- it just satisfies the column, same as
        // every other verification-token purpose.
        token.setTargetEmail(user.getEmail());
        token.setExpiresAt(expiresAt);
        verificationTokenRepository.saveAndFlush(token);

        return new ExternalVerifyResponse(rawToken, expiresAt);
    }

    // =========================================================================
    // Step 2: /external/pay
    // =========================================================================

    @Override
    @Transactional
    public ExternalPayResponse pay(ExternalPayRequest request) {
        Claims claims = parseClaims(request.verificationToken());
        if (!TokenPurpose.EXTERNAL_TRANSFER.name().equals(claims.get("purpose", String.class))) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }

        String hash = TokenHasher.sha256Hex(request.verificationToken());
        VerificationToken token = verificationTokenRepository.findByTokenHashForUpdate(hash)
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID));

        if (token.getPurpose() != TokenPurpose.EXTERNAL_TRANSFER) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }

        UUID userId = UUID.fromString(claims.getSubject());
        if (!token.getUserId().equals(userId)) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }

        if (token.getConsumedAt() != null) {
            throw new ApiException(ErrorCode.TOKEN_ALREADY_USED);
        }
        if (token.getExpiresAt().isBefore(OffsetDateTime.now(ZoneOffset.UTC))) {
            throw new ApiException(ErrorCode.TOKEN_EXPIRED);
        }

        // "search for the username": the verified user behind this token.
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID));

        Wallet wallet = walletService.requireByUserId(user.getId());
        long amountCents = MoneyConverter.majorToCents(request.cashAmount());

        WalletTransaction transaction;
        try {
            // merchantName is deliberately left out of every persisted
            // field (description, counterparty, ...) -- only productName
            // is stored, in the human-readable description.
            transaction = walletTransactionService.record(RecordTransactionRequest.builder()
                    .walletId(wallet.getId())
                    .type(TransactionType.EXTERNAL_TRANSFER)
                    .direction(TransactionDirection.DEBIT)
                    .amountCents(amountCents)
                    .description("External payment: Bought " + request.productName().trim() + " From: " + request.merchantName())
                    .build());
        } catch (IllegalStateException ex) {
            throw new ApiException(ErrorCode.INSUFFICIENT_BALANCE, "cashAmount");
        }

        // One-time use: burn the token now that the debit has posted.
        token.setConsumedAt(OffsetDateTime.now(ZoneOffset.UTC));
        verificationTokenRepository.save(token);

        return new ExternalPayResponse(
                transaction.getId(),
                transaction.getReference(),
                transaction.getStatus(),
                MoneyConverter.centsToMajor(transaction.getAmountCents()),
                request.merchantName(),
                request.productName(),
                transaction.getCreatedAt()
        );
    }

    private Claims parseClaims(String rawToken) {
        try {
            return jwtService.parse(rawToken).getPayload();
        }catch (ExpiredJwtException ex) {
            throw new ApiException(ErrorCode.TOKEN_EXPIRED);
        }
        catch (JwtException | IllegalArgumentException ex) {
            throw new ApiException(ErrorCode.TOKEN_INVALID);
        }
    }
}
