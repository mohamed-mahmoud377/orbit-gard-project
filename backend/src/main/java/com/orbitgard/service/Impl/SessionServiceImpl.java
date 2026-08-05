package com.orbitgard.service.Impl;

import com.orbitgard.dto.response.SessionSummaryResponse;
import com.orbitgard.entity.Session;
import com.orbitgard.enums.SessionRevokedReason;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.geo.GeoLocationResolver;
import com.orbitgard.repository.SessionRepository;
import com.orbitgard.service.SessionService;
import com.orbitgard.service.AuthenticatedUserService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class SessionServiceImpl implements SessionService {

    private final SessionRepository sessionRepository;
    private final GeoLocationResolver geoLocationResolver;
    private final AuthenticatedUserService authenticatedUserService;

    public SessionServiceImpl(SessionRepository sessionRepository, GeoLocationResolver geoLocationResolver,
                              AuthenticatedUserService authenticatedUserService) {
        this.sessionRepository = sessionRepository;
        this.geoLocationResolver = geoLocationResolver;
        this.authenticatedUserService = authenticatedUserService;
    }

    @Override
    public List<SessionSummaryResponse> listActiveSessions() {
        var principal = authenticatedUserService.currentPrincipal();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        return sessionRepository.findActiveByUserId(principal.userId(), now).stream()
                .map(session -> toSummary(session, principal.sessionId()))
                .toList();
    }

    @Override
    @Transactional
    public void signOutOne(UUID targetSessionId) {
        var principal = authenticatedUserService.currentPrincipal();
        if (targetSessionId.equals(principal.sessionId())) {
            throw new ApiException(ErrorCode.CANNOT_SIGN_OUT_CURRENT_DEVICE);
        }
        sessionRepository.revokeIfActive(
                targetSessionId, principal.userId(), SessionRevokedReason.REMOTE_LOGOUT, OffsetDateTime.now(ZoneOffset.UTC));
    }

    @Override
    @Transactional
    public void signOutAllOthers() {
        var principal = authenticatedUserService.currentPrincipal();
        sessionRepository.revokeAllExcept(
                principal.userId(), principal.sessionId(), SessionRevokedReason.REMOTE_LOGOUT, OffsetDateTime.now(ZoneOffset.UTC));
    }

    @Override
    @Transactional
    public void signOutCurrent() {
        var principal = authenticatedUserService.currentPrincipal();
        sessionRepository.revokeIfActive(
                principal.sessionId(), principal.userId(), SessionRevokedReason.LOGOUT, OffsetDateTime.now(ZoneOffset.UTC));
    }

    private SessionSummaryResponse toSummary(Session session, UUID currentSessionId) {
        String location = null;
        if (session.getIpAddress() != null) {
            String ipAddress = session.getIpAddress().getHostAddress();
            // Try to resolve geolocation if available
            String geoLocation = geoLocationResolver.resolveLocation(session.getIpAddress()).orElse(null);
            if (geoLocation != null) {
                location = geoLocation + " · " + ipAddress;
            } else {
                location = ipAddress;
            }
        }

        return new SessionSummaryResponse(
                session.getId(),
                session.getDeviceLabel(),
                location,
                session.getLastUsedAt(),
                session.getId().equals(currentSessionId)
        );
    }
}
