package com.orbitgard.service.Impl;

import com.orbitgard.dto.request.TopUpRequest;
import com.orbitgard.dto.response.TopUpResponse;
import com.orbitgard.entity.Payment;
import com.orbitgard.entity.User;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.PaymentStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.mapper.PaymobMapper;
import com.orbitgard.paymob.PaymobClient;
import com.orbitgard.paymob.TopUpFee;
import com.orbitgard.dto.response.PaymobIntentionResponse;
import com.orbitgard.paymob.PaymobProperties;
import com.orbitgard.repository.PaymentRepository;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.service.TopUpService;
import com.orbitgard.service.AuthenticatedUserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpClientErrorException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Slf4j
public class TopUpServiceImpl implements TopUpService {

    private static final BigDecimal MIN_AMOUNT = new BigDecimal("50.00");
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("20000.00");

    private final UserRepository userRepository;
    private final PaymentRepository paymentRepository;
    private final PaymobClient paymobClient;
    private final PaymobProperties paymobProperties;
    private final AuthenticatedUserService authenticatedUserService;

    public TopUpServiceImpl(UserRepository userRepository, PaymentRepository paymentRepository,
                            PaymobClient paymobClient, PaymobProperties paymobProperties,
                            AuthenticatedUserService authenticatedUserService) {
        this.userRepository = userRepository;
        this.paymentRepository = paymentRepository;
        this.paymobClient = paymobClient;
        this.paymobProperties = paymobProperties;
        this.authenticatedUserService = authenticatedUserService;
    }

    @Override
    @Transactional
    public TopUpResponse initiate(TopUpRequest request) {
        UUID userId = authenticatedUserService.currentPrincipal().userId();
        if (request.amount() == null || request.amount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ApiException(ErrorCode.AMOUNT_INVALID, "amount");
        }
        if (request.amount().compareTo(MIN_AMOUNT) < 0) {
            throw new ApiException(ErrorCode.AMOUNT_BELOW_MINIMUM, "amount");
        }
        if (request.amount().compareTo(MAX_AMOUNT) > 0) {
            throw new ApiException(ErrorCode.AMOUNT_ABOVE_MAXIMUM, "amount");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));

        if (user.getAccountType() == AccountType.CHILD) {
            throw new ApiException(ErrorCode.CHILD_CANNOT_TOP_UP);
        }


        int creditCents = toMinorUnits(request.amount());
        int chargeCents = TopUpFee.chargeCents(creditCents);
        UUID paymentId = UUID.randomUUID();

        // 1) Create the row first, as STARTED — before Paymob even knows this
        //    payment exists. Gives you an audit trail even if the Paymob call
        //    never completes (network failure, timeout, etc).
        Payment payment = PaymobMapper.toStartedPayment(paymentId, user, chargeCents, creditCents);
        paymentRepository.save(payment);

        var intentionRequest = PaymobMapper.toIntentionRequest(user, paymobProperties, chargeCents, paymentId);

        PaymobIntentionResponse intentionResponse;
        try {
            intentionResponse = paymobClient.createIntention(intentionRequest);
        } catch (HttpClientErrorException ex) {
            log.error("Paymob rejected intention request: {} - body: {}",
                    ex.getStatusCode(), ex.getResponseBodyAsString());
            payment.setStatus(PaymentStatus.FAILED);
            payment.setFailureReason("Paymob rejected the intention request");
            paymentRepository.save(payment);
            throw new ApiException(ErrorCode.PAYMOB_UNREACHABLE);
        } catch (Exception ex) {
            log.error("Paymob unreachable", ex);
            payment.setStatus(PaymentStatus.FAILED);
            payment.setFailureReason("Paymob was unreachable");
            paymentRepository.save(payment);
            throw new ApiException(ErrorCode.PAYMOB_UNREACHABLE);
        }

        // 2) Paymob accepted the intention — flip to processing and store
        //    the intention id, which is what getIntentionStatus() will use
        //    later to actively re-check the outcome.
        PaymobMapper.applyIntentionResponse(payment, intentionResponse.getId(), intentionResponse.getClientSecret());
        paymentRepository.save(payment);

        String redirectUrl = paymobClient.buildCheckoutRedirectUrl(intentionResponse.getClientSecret());
        return new TopUpResponse(
                paymentId,
                redirectUrl,
                toMajor(creditCents),
                toMajor(chargeCents - creditCents),
                toMajor(chargeCents));
    }

    private static BigDecimal toMajor(int cents) {
        return BigDecimal.valueOf(cents).movePointLeft(2).setScale(2, RoundingMode.UNNECESSARY);
    }

    private int toMinorUnits(BigDecimal amount) {
        try {
            return amount.setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).intValueExact();
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("Amount not representable in minor units: " + amount);
        }
    }
}
