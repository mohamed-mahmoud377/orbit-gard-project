package com.orbitgard.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.logging")
public record LoggingProperties(boolean enabled, int maxBodyLength) {
}