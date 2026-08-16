package com.orbitgard.service;

import com.orbitgard.dto.request.UpdateChildLimitsRequest;
import com.orbitgard.dto.response.ChildTransactionPageResponse;
import com.orbitgard.dto.response.FamilyChildDetailResponse;
import com.orbitgard.dto.response.FamilyChildResponse;
import com.orbitgard.dto.response.FamilyOverviewResponse;

import java.util.List;
import java.util.UUID;

/**
 * The authenticated parent's view of their children. Every method here is
 * scoped to the caller's own household — a child id belonging to someone
 * else is indistinguishable from one that does not exist.
 */
public interface FamilyService {

    /** Aggregate stats bar: children count, allocated, spent, blocked attempts. */
    FamilyOverviewResponse getOverview();

    /** Card list: each child with a wallet snapshot and limit progress. */
    List<FamilyChildResponse> listChildren();

    /** One child's detail screen: header, wallet, and full limits block. */
    FamilyChildDetailResponse getChild(UUID childId);

    /** Partial update of a child's ceilings. Returns the refreshed detail view. */
    FamilyChildDetailResponse updateChildLimits(UUID childId, UpdateChildLimitsRequest request);

    /** One child's activity feed, newest first. */
    ChildTransactionPageResponse listChildTransactions(UUID childId, int page, int size);
}