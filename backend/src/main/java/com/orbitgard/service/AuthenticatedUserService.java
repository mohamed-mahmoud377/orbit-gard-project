package com.orbitgard.service;

import com.orbitgard.security.JwtPrincipal;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/** Provides the JWT identity to application services without exposing it to controllers. */
@Service
public class AuthenticatedUserService {

    public JwtPrincipal currentPrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof JwtPrincipal principal)) {
            throw new AuthenticationCredentialsNotFoundException("No authenticated JWT principal is available");
        }
        return principal;
    }

    public String currentUsername() {
        return currentPrincipal().username();
    }
}
