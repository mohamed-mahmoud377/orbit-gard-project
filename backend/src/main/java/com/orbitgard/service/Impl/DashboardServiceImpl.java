package com.orbitgard.service.Impl;

import com.orbitgard.dto.response.UserProfileResponse;
import com.orbitgard.entity.User;
import com.orbitgard.enums.AccountType;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.DashboardService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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

    @Override
    public UserProfileResponse getCurrentUser() {

        UUID userId = authenticatedUserService.currentPrincipal().userId();

        User user = userRepository.findById(userId)
                .orElseThrow(() ->
                        new NoSuchElementException("User not found: " + userId));

        Integer childrenCount = user.getAccountType() == AccountType.USER
                ? (int) userRepository.countByParent_Id(user.getId())
                : null;

        return new UserProfileResponse(
                user.getFirstName(),
                user.getLastName(),
                user.getUsername(),
                user.getAccountType().name(),
                childrenCount
        );
    }
}