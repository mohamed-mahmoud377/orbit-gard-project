package com.orbitgard.service.Impl;

import com.orbitgard.dto.response.UserProfileResponse;
import com.orbitgard.entity.User;
import com.orbitgard.enums.AccountType;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.DashboardService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Slf4j
public class DashboardServiceImpl implements DashboardService {

    private final UserRepository userRepository;
    private final AuthenticatedUserService authenticatedUserService;

    public DashboardServiceImpl(
            UserRepository userRepository,
            AuthenticatedUserService authenticatedUserService) {

        this.userRepository = userRepository;
        this.authenticatedUserService = authenticatedUserService;
    }

    /**
     * Transactional because of the parent read below: User#parent is LAZY and
     * open-session-in-view is off, so touching it outside a transaction throws
     * LazyInitializationException. Only a CHILD reaches that branch, which is
     * why this failed for children alone while parents were served fine.
     */
    @Override
    @Transactional(readOnly = true)
    public UserProfileResponse getCurrentUser() {

        UUID userId = authenticatedUserService.currentPrincipal().userId();

        User user = userRepository.findById(userId)
                .orElseThrow(() ->
                        new NoSuchElementException("User not found: " + userId));

        boolean isParent = user.getAccountType() == AccountType.USER;

        Integer childrenCount = isParent
                ? (int) userRepository.countByParent_Id(user.getId())
                : null;

        String parentFirstName = !isParent && user.getParent() != null
                ? user.getParent().getFirstName()
                : null;

        return new UserProfileResponse(
                user.getFirstName(),
                user.getLastName(),
                user.getUsername(),
                user.getAccountType().name(),
                childrenCount,
                parentFirstName
        );
    }
}