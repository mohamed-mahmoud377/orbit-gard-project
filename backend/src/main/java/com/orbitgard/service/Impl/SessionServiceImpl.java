package com.orbitgard.service.Impl;

import com.orbitgard.dto.response.SessionSummaryResponse;
import com.orbitgard.entity.Session;
import com.orbitgard.enums.SessionRevokedReason;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.geo.GeoLocationResolver;
import com.orbitgard.repository.SessionRepository;
import com.orbitgard.service.SessionService;
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

    public SessionServiceImpl(SessionRepository sessionRepository, GeoLocationResolver geoLocationResolver) {
        this.sessionRepository = sessionRepository;
        this.geoLocationResolver = geoLocationResolver;
    }

    @Override
    public List<SessionSummaryResponse> listActiveSessions(UUID userId, UUID currentSessionId) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        return sessionRepository.findActiveByUserId(userId, now).stream()
                .map(session -> toSummary(session, currentSessionId))
                .toList();
    }

    @Override
    @Transactional
    public void signOutOne(UUID userId, UUID currentSessionId, UUID targetSessionId) {
        if (targetSessionId.equals(currentSessionId)) {
            throw new ApiException(ErrorCode.CANNOT_SIGN_OUT_CURRENT_DEVICE);
        }
        sessionRepository.revokeIfActive(
                targetSessionId, userId, SessionRevokedReason.REMOTE_LOGOUT, OffsetDateTime.now(ZoneOffset.UTC));
    }

    @Override
    @Transactional
    public void signOutAllOthers(UUID userId, UUID currentSessionId) {
        sessionRepository.revokeAllExcept(
                userId, currentSessionId, SessionRevokedReason.REMOTE_LOGOUT, OffsetDateTime.now(ZoneOffset.UTC));
    }

    private SessionSummaryResponse toSummary(Session session, UUID currentSessionId) {
        String location = null;
        if (session.getIpAddress() != null) {
            String ipAddress = session.getIpAddress().getHostAddress();
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
