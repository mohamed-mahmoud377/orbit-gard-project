package com.orbitgard.service;

import com.orbitgard.entity.User;

import java.util.UUID;

public interface ChildSpendingLimitService {
    
    void enforceIfChild(User sender, UUID senderWalletId, long amountCents);
}