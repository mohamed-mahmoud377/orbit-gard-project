package com.orbitgard.service;

import com.orbitgard.entity.User;
import com.orbitgard.entity.VerificationToken;
import com.orbitgard.enums.TokenPurpose;
import com.orbitgard.enums.UserStatus;
import com.orbitgard.exception.TokenAlreadyUsedException;
import com.orbitgard.exception.TokenExpiredException;
import com.orbitgard.exception.TokenInvalidException;
import com.orbitgard.dto.auth.VerifyEmailResponse;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.repository.VerificationTokenRepository;
import com.orbitgard.util.TokenHasher;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final VerificationTokenRepository verificationTokenRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public VerifyEmailResponse verifyEmail(String rawToken) {

        String hash = TokenHasher.sha256Hex(rawToken);

        VerificationToken token = verificationTokenRepository.findByTokenHash(hash)
                .orElseThrow(TokenInvalidException::new);

        if (token.getPurpose() != TokenPurpose.EMAIL_VERIFICATION) {
            throw new TokenInvalidException();
        }

        User user = userRepository.findById(token.getUserId())
                .orElseThrow(TokenInvalidException::new);

        // Already active -> this is a repeat click. Return success, not an error.
        if (user.getStatus() == UserStatus.ACTIVE) {
            return new VerifyEmailResponse(user.getUsername(), user.getStatus(), token.getConsumedAt());
        }

        if (token.getConsumedAt() != null) {
            throw new TokenAlreadyUsedException();
        }

        if (token.getExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new TokenExpiredException();
        }

        OffsetDateTime now = OffsetDateTime.now();
        user.setStatus(UserStatus.ACTIVE);
        token.setConsumedAt(now);

        userRepository.save(user);
        verificationTokenRepository.save(token);

        return new VerifyEmailResponse(user.getUsername(), user.getStatus(), now);
    }
}