package com.orbitgard.service;

import com.orbitgard.dto.response.ChildActivitySummaryResponse;
import com.orbitgard.dto.response.ChildTransactionPageResponse;
import com.orbitgard.dto.response.ChildWalletResponse;

/**
 * The child's view of their own wallet.
 *
 * Every method scopes itself to the authenticated principal — no id is ever
 * accepted from the caller, so there is nothing for a child to tamper with.
 */
public interface ChildSelfService {

    /** Balances, both limit windows, money being checked, and recent movements. */
    ChildWalletResponse getOwnWallet();

    /** Spend and receipt counters for the current UTC day and month. */
    ChildActivitySummaryResponse getOwnActivitySummary();

    /** The child's full activity list, newest first. */
    ChildTransactionPageResponse listOwnTransactions(int page, int size);
}
