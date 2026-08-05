package com.orbitgard.service;

import com.orbitgard.dto.response.SessionSummaryResponse;

import java.util.List;
import java.util.UUID;

public interface SessionService {

    List<SessionSummaryResponse> listActiveSessions(UUID userId, UUID currentSessionId);

    void signOutOne(UUID userId, UUID currentSessionId, UUID targetSessionId);

    void signOutAllOthers(UUID userId, UUID currentSessionId);
}
