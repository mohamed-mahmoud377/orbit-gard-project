package com.orbitgard.logging;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orbitgard.config.LoggingProperties;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Masks known-sensitive field names inside a JSON body before it is logged.
 * Never mutates the real request/response — only the string used for logging.
 */
@Component
public class LogBodyMasker {

    // Every field named in the story's "Never log a secret" list.
    private static final Set<String> SENSITIVE_FIELDS = Set.of(
            "password", "confirmPassword",
            "refreshToken", "accessToken",
            "client_secret", "secretKey", "apiKey", "hmacSecret"
    );

    private final ObjectMapper objectMapper;
    private final LoggingProperties properties;

    public LogBodyMasker(ObjectMapper objectMapper, LoggingProperties properties) {
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    /** Field-level masking: keeps the JSON shape, blanks out sensitive values. */
    public String maskAndTruncate(String rawBody) {
        if (rawBody == null || rawBody.isBlank()) {
            return "\"NA\"";
        }
        try {
            JsonNode node = objectMapper.readTree(rawBody);
            maskRecursively(node);
            return truncate(objectMapper.writeValueAsString(node));
        } catch (Exception notJson) {
            // Not JSON (or unparseable) — truncate the raw text, nothing to mask structurally.
            return truncate(rawBody);
        }
    }

    /** Used when the whole body must be hidden, e.g. Paymob error responses. */
    public String maskEntirely() {
        return "***";
    }

    private void maskRecursively(JsonNode node) {
        if (node instanceof ObjectNode obj) {
            obj.fieldNames().forEachRemaining(field -> {
                if (SENSITIVE_FIELDS.contains(field)) {
                    obj.put(field, "***");
                } else {
                    maskRecursively(obj.get(field));
                }
            });
        } else if (node.isArray()) {
            node.forEach(this::maskRecursively);
        }
    }

    private String truncate(String body) {
        int max = properties.maxBodyLength();
        if (body.length() <= max) {
            return body;
        }
        return body.substring(0, max) + "...[truncated]";
    }
}