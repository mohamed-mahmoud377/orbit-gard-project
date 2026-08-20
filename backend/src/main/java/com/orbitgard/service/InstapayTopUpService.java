package com.orbitgard.service;

import com.orbitgard.dto.response.InstapayAccountResponse;
import com.orbitgard.dto.response.InstapayRequestListResponse;
import com.orbitgard.dto.response.InstapayRequestResponse;
import com.orbitgard.dto.response.InstapayUploadResponse;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

public interface InstapayTopUpService {

    InstapayUploadResponse uploadReceipt(MultipartFile file);

    /** Every request the authenticated user has made, newest first. */
    InstapayRequestListResponse listRequests();

    /**
     * One request, scoped to the authenticated user.
     *
     * Lets a client that has just uploaded follow that one request without
     * re-fetching the whole list every two seconds. Scoped rather than
     * looked up by id alone: somebody else's request must be a 404, not a
     * 403, because "this id does not exist for you" is all a caller is
     * entitled to learn.
     */
    InstapayRequestResponse getRequest(UUID requestId);

    /** Where to send the money, and the limits Orbit will accept. */
    InstapayAccountResponse getAccountDetails();
}