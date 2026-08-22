package com.orbitgard.gemini;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orbitgard.dto.request.GeminiGenerateContentRequest;
import com.orbitgard.dto.response.GeminiGenerateContentResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * One HTTP call to generateContent. Knows nothing about receipts.
 *
 * The body is serialised and deserialised here with an explicit ObjectMapper
 * rather than left to RestClient's message converters. That is not
 * fussiness: this project runs Boot 4, which auto-configures Jackson 3,
 * while Jackson2Config supplies a Jackson 2 mapper for the Paymob models.
 * The request DTOs depend on @JsonInclude(NON_NULL) being honoured — a part
 * serialised as {"text": "...", "inlineData": null} is not the shape the
 * API accepts — so which mapper runs is not something to leave to
 * auto-configuration. Serialising to a String pins it.
 *
 * The two mappers are distinct Java types, so injecting
 * com.fasterxml.jackson.databind.ObjectMapper resolves unambiguously to the
 * Jackson2Config bean.
 */
@Component
@Slf4j
public class GeminiClient {

    private static final String GENERATE_CONTENT_PATH = "/v1beta/models/{model}:generateContent";

    private final RestClient restClient;
    private final GeminiProperties props;
    private final ObjectMapper objectMapper;

    public GeminiClient(@Qualifier("geminiRestClient") RestClient restClient,
            GeminiProperties props,
            ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.props = props;
        this.objectMapper = objectMapper;
    }

    /**
     * @throws GeminiCallException when no answer was obtained at all. A
     *                             response that arrives but says something
     *                             unwelcome is not an
     *                             exception — that is the caller's to interpret.
     */
    public GeminiGenerateContentResponse generateContent(GeminiGenerateContentRequest request) {
        String body = serialize(request);

        String raw;
        try {
            raw = restClient.post()
                    .uri(uriBuilder -> uriBuilder
                            .path(GENERATE_CONTENT_PATH)
                            .build(props.getModel()))
                    // Set on the request, not left to the default header.
                    // A String body is written by StringHttpMessageConverter,
                    // which will stamp text/plain if the content type is not
                    // pinned here — and the API rejects that.
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("x-goog-api-key", props.getApiKey())
                    .body(body)
                    .exchange((httpRequest, httpResponse) -> {
                        HttpStatusCode status = httpResponse.getStatusCode();
                        String text = new String(httpResponse.getBody().readAllBytes());

                        if (status.value() == 429) {
                            throw new GeminiCallException(GeminiCallException.Kind.RATE_LIMITED,
                                    "Gemini rate limited the request", null);
                        }
                        if (status.isError()) {
                            // Status only. The body echoes back the prompt,
                            // which contains somebody's bank receipt.
                            throw new GeminiCallException(GeminiCallException.Kind.TRANSPORT,
                                    "Gemini returned " + status.value() + "and res body is: " + text, null);
                        }
                        return text;
                    });
        } catch (GeminiCallException e) {
            throw e;
        } catch (RestClientException e) {
            throw new GeminiCallException(GeminiCallException.Kind.TRANSPORT,
                    "Gemini call failed", e);
        }

        return deserialize(raw);
    }

    private String serialize(GeminiGenerateContentRequest request) {
        try {
            return objectMapper.writeValueAsString(request);
        } catch (JsonProcessingException e) {
            // Our own object failed to serialise — a bug here, not a
            // transport problem, and retrying will not change it.
            throw new IllegalStateException("Could not serialise the Gemini request", e);
        }
    }

    private GeminiGenerateContentResponse deserialize(String raw) {
        try {
            return objectMapper.readValue(raw, GeminiGenerateContentResponse.class);
        } catch (JsonProcessingException e) {
            throw new GeminiCallException(GeminiCallException.Kind.TRANSPORT,
                    "Gemini returned a body that is not the expected envelope", e);
        }
    }
}