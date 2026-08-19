package com.orbitgard.gemini;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Gemini connection settings. Same shape as PaymobProperties.
 *
 * apiKey has no default on purpose — it comes from GEMINI_API_KEY and is
 * never committed, never pasted into a card or a chat.
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "gemini")
public class GeminiProperties {

    private String apiKey;
    private String model = "gemini-3.1-flash-lite";
    private String baseUrl = "https://generativelanguage.googleapis.com";
    private Duration connectTimeout = Duration.ofSeconds(5);
    private Duration readTimeout = Duration.ofSeconds(30);

    /**
     * Long edge, in pixels, after downscaling. A phone screenshot is
     * 1170x2532 and nothing is gained by sending all of it.
     */
    private int maxImageEdgePx = 1000;

    /** JPEG quality for the downscaled image. */
    private float jpegQuality = 0.85f;

    /**
     * Headroom over the ~140-token payload. Too tight and the JSON comes
     * back truncated with finishReason MAX_TOKENS.
     */
    private int maxOutputTokens = 300;
}
