package com.orbitgard.service;

import com.orbitgard.dto.response.SessionSummaryResponse;

import java.util.List;
import java.util.UUID;

public interface SessionService {

    List<SessionSummaryResponse> listActiveSessions();

    void signOutOne(UUID targetSessionId);

    void signOutAllOthers();

    void signOutCurrent();
}
