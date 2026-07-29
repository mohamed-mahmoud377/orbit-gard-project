package com.orbitgard.auth.event;

import com.orbitgard.entity.User;

public record UserRegisteredEvent(User user) {
}