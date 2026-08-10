package com.orbitgard.logging;

import com.orbitgard.config.LoggingProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Slf4j
@Component
public class PaymobLoggingInterceptor implements ClientHttpRequestInterceptor {

    private final LoggingProperties properties;
    private final LogBodyMasker masker;

    public PaymobLoggingInterceptor(LoggingProperties properties, LogBodyMasker masker) {
        this.properties = properties;
        this.masker = masker;
    }

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body,
                                        ClientHttpRequestExecution execution) throws IOException {
        if (!properties.enabled()) {
            return execution.execute(request, body);
        }

        String method = request.getMethod().name();
        String url = maskUrl(request.getURI().toString());
        String requestBody = new String(body, StandardCharsets.UTF_8);

        // Note: headers are never logged here, so the "Authorization: Token sk_..."
        // header never has a chance to leak — the doc calls this out as the easy
        // way to keep it safe.
        log.info("-> {} {} Body: {}", method, url, masker.maskAndTruncate(requestBody));

        long start = System.currentTimeMillis();
        ClientHttpResponse response = execution.execute(request, body);
        long tookMs = System.currentTimeMillis() - start;

        // Requires the RestClient's request factory to be wrapped in
        // BufferingClientHttpRequestFactory (see PaymobClientConfig below) —
        // otherwise this read would exhaust the stream for the real caller.
        byte[] responseBytes = StreamUtils.copyToByteArray(response.getBody());
        String responseBodyText = new String(responseBytes, StandardCharsets.UTF_8);

        int status = response.getStatusCode().value();
        String loggedBody = (status >= 400)
                ? masker.maskEntirely()          // errors echo billing data — hide the whole thing
                : masker.maskAndTruncate(responseBodyText);

        log.info("<- {} {} status[{}] Body: {} [Took {} ms]", method, url, status, loggedBody, tookMs);

        return response;
    }

    /** Masks only the client_secret segment of Paymob's status-check URL, keeps the public key visible. */
    private String maskUrl(String url) {
        return url.replaceAll("(/intention/element/pk_[^/]+/)[^/]+(/?)", "$1***$2");
    }
}