package com.orbitgard.gemini;

import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.HttpClientSettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
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

        HttpClientSettings settings = HttpClientSettings
                .defaults()
                .withConnectTimeout(props.getConnectTimeout())
                .withReadTimeout(props.getReadTimeout());

        return builder
                .requestFactory(ClientHttpRequestFactoryBuilder.detect().build(settings))
                .baseUrl(props.getBaseUrl())
                .defaultHeader("x-goog-api-key", props.getApiKey())
                .build();
    }
}