package com.orbitgard.logging;

import com.orbitgard.config.LoggingProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.springframework.web.util.ContentCachingResponseWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestResponseLoggingFilter extends OncePerRequestFilter {

    private static final String REQUEST_ID_KEY = "requestId";

    private final LoggingProperties properties;
    private final LogBodyMasker masker;

    public RequestResponseLoggingFilter(LoggingProperties properties, LogBodyMasker masker) {
        this.properties = properties;
        this.masker = masker;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        if (!properties.enabled()) {
            chain.doFilter(request, response);
            return;
        }

        // "One request, many lines" — tag every line from this request so concurrent
        // requests don't interleave into an unreadable mess.
        MDC.put(REQUEST_ID_KEY, UUID.randomUUID().toString());

        ContentCachingRequestWrapper wrappedRequest = new ContentCachingRequestWrapper(request, 0);
        ContentCachingResponseWrapper wrappedResponse = new ContentCachingResponseWrapper(response);

        long start = System.currentTimeMillis();
        try {
            chain.doFilter(wrappedRequest, wrappedResponse);
        } finally {
            long tookMs = System.currentTimeMillis() - start;
            logExchange(wrappedRequest, wrappedResponse, tookMs);

            // Required — ContentCachingResponseWrapper buffers the body instead of
            // streaming it; without this the client receives an empty response.
            wrappedResponse.copyBodyToResponse();
            MDC.remove(REQUEST_ID_KEY);
        }
    }

    private void logExchange(ContentCachingRequestWrapper req,
                             ContentCachingResponseWrapper res,
                             long tookMs) {

        String method = req.getMethod();
        String fullPath = buildFullPath(req); // includes context path, per the story's note

        String requestBody = new String(req.getContentAsByteArray(), StandardCharsets.UTF_8);
        log.info("=> {} {} Body: {}", method, fullPath, masker.maskAndTruncate(requestBody));

        String responseBody = new String(res.getContentAsByteArray(), StandardCharsets.UTF_8);
        // Failures logged exactly like successes — no special-casing on status.
        log.info("<= {} {} Status[{}] Body: {} [Took {} ms]",
                method, fullPath, res.getStatus(), masker.maskAndTruncate(responseBody), tookMs);
    }

    private String buildFullPath(HttpServletRequest req) {
        String uri = req.getRequestURI(); // already includes the /api/v1 context path
        String query = req.getQueryString();
        return query != null ? uri + "?" + query : uri;
    }
}