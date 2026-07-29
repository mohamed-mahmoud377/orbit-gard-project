package com.orbitgard.service;

import com.orbitgard.dto.auth.ResendVerificationResponse;
import com.orbitgard.entity.User;
import com.orbitgard.entity.VerificationToken;
import com.orbitgard.enums.TokenPurpose;
import com.orbitgard.enums.UserStatus;
import com.orbitgard.exception.RateLimitedException;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.repository.VerificationTokenRepository;
import com.orbitgard.util.TokenGenerator;
import com.orbitgard.util.TokenHasher;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class VerificationEmailServiceImpl implements VerificationEmailService {

    private static final long COOLDOWN_SECONDS = 120;
    private static final String GENERIC_RESEND_MESSAGE = "If that address needs confirming, a new link is on its way.";

    private final JavaMailSender mailSender;
    private final UserRepository userRepository;
    private final VerificationTokenRepository verificationTokenRepository;
    private final TokenGenerator tokenGenerator;

    @Value("${app.frontend.base-url}")
    private String frontendBaseUrl;

    @Override
    public void sendVerificationEmail(User user) {
        generateAndSendToken(user);
    }

    @Override
    @Transactional
    public ResendVerificationResponse resendVerification(String email) {

        User user = userRepository.findByEmail(email).orElse(null);

        if (user == null || user.getStatus() == UserStatus.ACTIVE) {
            return new ResendVerificationResponse(GENERIC_RESEND_MESSAGE, COOLDOWN_SECONDS);
        }

        verificationTokenRepository.findTopByUserIdAndPurposeOrderByCreatedAtDesc(user.getId(), TokenPurpose.EMAIL_VERIFICATION)
                .ifPresent(lastToken -> {
                    long secondsSinceLast = Duration.between(lastToken.getCreatedAt(), OffsetDateTime.now()).getSeconds();
                    if (secondsSinceLast < COOLDOWN_SECONDS) {
                        throw new RateLimitedException(COOLDOWN_SECONDS - secondsSinceLast);
                    }
                });

        List<VerificationToken> liveTokens = verificationTokenRepository
                .findByUserIdAndPurposeAndConsumedAtIsNull(user.getId(), TokenPurpose.EMAIL_VERIFICATION);

        OffsetDateTime now = OffsetDateTime.now();
        liveTokens.forEach(t -> t.setConsumedAt(now));
        verificationTokenRepository.saveAll(liveTokens);

        generateAndSendToken(user);

        return new ResendVerificationResponse(GENERIC_RESEND_MESSAGE, COOLDOWN_SECONDS);
    }

    private void generateAndSendToken(User user) {

        Duration validity = Duration.ofHours(12);
        String rawToken = tokenGenerator.generate(user.getId(), TokenPurpose.EMAIL_VERIFICATION, user.getEmail(), validity);
        String hash = TokenHasher.sha256Hex(rawToken);

        VerificationToken token = new VerificationToken();
        token.setUserId(user.getId());
        token.setTokenHash(hash);
        token.setPurpose(TokenPurpose.EMAIL_VERIFICATION);
        token.setTargetEmail(user.getEmail());
        token.setExpiresAt(OffsetDateTime.now().plusHours(12));
        verificationTokenRepository.save(token);

        String activationLink = frontendBaseUrl + "/activate?token=" + rawToken;

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(user.getEmail());
            helper.setSubject("Confirm your email to activate your Orbit wallet");
            helper.setText(buildHtmlBody(user.getFirstName(), activationLink), true);
            mailSender.send(message);
        } catch (MessagingException e) {
            throw new IllegalStateException("Failed to send verification email", e);
        }
    }

    private String buildHtmlBody(String firstName, String activationLink) {
        return """
                <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
                    <p>Hi %s,</p>
                    <p>Welcome to Orbit. Confirm this email address and your wallet will be ready to use.</p>
                    <p style="text-align: center; margin: 32px 0;">
                        <a href="%s" style="background-color: #1a1a2e; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                            Activate my wallet
                        </a>
                    </p>
                    <p>This link expires in 12 hours and can only be used once. If you ask us for a new link, this one stops working straight away.</p>
                    <p style="font-size: 12px; color: #666;">
                        If the button above doesn't work, copy and paste this link into your browser:<br>
                        <a href="%s">%s</a>
                    </p>
                    <p style="font-size: 12px; color: #666;">
                        If you did not create an Orbit account, you can safely ignore this email — no wallet will be activated and no further messages will be sent.
                    </p>
                </div>
                """.formatted(firstName, activationLink, activationLink, activationLink);
    }
}