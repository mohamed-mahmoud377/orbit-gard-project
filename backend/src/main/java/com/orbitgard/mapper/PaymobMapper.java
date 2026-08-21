package com.orbitgard.mapper;

import com.orbitgard.dto.request.PaymobIntentionRequest;
import com.orbitgard.entity.Payment;
import com.orbitgard.entity.User;
import com.orbitgard.enums.PaymentStatus;
import com.orbitgard.paymob.PaymobProperties;

import java.util.UUID;

public final class PaymobMapper {

    private PaymobMapper() {
    }

    public static Payment toStartedPayment(UUID paymentId, User user, int chargeCents, int creditCents) {
        return Payment.builder()
                .id(paymentId)
                .user(user)
                .amountCents(chargeCents)
                .creditCents(creditCents)
                .currency("EGP")
                .status(PaymentStatus.STARTED)
                .build();
    }

    public static PaymobIntentionRequest toIntentionRequest(User user, PaymobProperties props, int amountCents, UUID paymentId) {
        return PaymobIntentionRequest.builder()
                .amount(amountCents)
                .currency("EGP")
                .redirectionUrl(props.getCallbackUrl())
                .notificationUrl(props.getNotificationUrl())
                .paymentMethods(props.getPaymentMethodIds())
                .billingData(PaymobIntentionRequest.BillingData.builder()
                        .firstName(user.getFirstName())
                        .lastName(user.getLastName())
                        .phoneNumber(user.getPhoneNumber())
                        .email(user.getEmail())
                        .build())
                .customer(PaymobIntentionRequest.Customer.builder()
                        .firstName(user.getFirstName())
                        .lastName(user.getLastName())
                        .email(user.getEmail())
                        .build())
                .specialReference(paymentId.toString())
                .build();
    }

    public static void applyIntentionResponse(Payment payment, String intentionId, String clientSecret) {
        payment.setStatus(PaymentStatus.AWAITING_CONFIRMATION);
        payment.setPaymobIntentionId(intentionId);
        payment.setPaymobClientSecret(clientSecret);
    }
}
