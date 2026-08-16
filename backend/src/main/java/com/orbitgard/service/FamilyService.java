package com.orbitgard.service;

import com.orbitgard.dto.response.FamilyChildResponse;
import com.orbitgard.dto.response.FamilyOverviewResponse;

import java.util.List;

/** Read-only views over the authenticated parent's children — backs the Family tab. */
public interface FamilyService {

    /** Aggregate stats bar: children count, allocated, spent, blocked attempts. */
    FamilyOverviewResponse getOverview();

    /** Card list: each child with a wallet snapshot and limit progress. */
    List<FamilyChildResponse> listChildren();
}
