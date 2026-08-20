package com.orbitgard.gemini;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import lombok.extern.slf4j.Slf4j;

@Configuration
@Slf4j
public class GeminiConfig {

    /**
     * The API key is set here, once, as a default header.
     *
     * As a header and never as a query parameter: a key in a URL ends up in
     * access logs, proxy logs and stack traces. PaymobClient.getIntentionStatus()
     * makes exactly that mistake today by putting the client secret in the
     * path — this is the version that does not.
     */
    @Bean("geminiRestClient")
    public RestClient geminiRestClient(RestClient.Builder builder, GeminiProperties props) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        if (props.getConnectTimeout() != null) {
            requestFactory.setConnectTimeout(props.getConnectTimeout());
        }
        if (props.getReadTimeout() != null) {
            requestFactory.setReadTimeout(props.getReadTimeout());
        }
        log.info("api key is: {}", props.getApiKey());

        return builder
                .requestFactory(requestFactory)
                .baseUrl(props.getBaseUrl())
                .defaultHeader("x-goog-api-key", props.getApiKey())
                .build();
    }
}