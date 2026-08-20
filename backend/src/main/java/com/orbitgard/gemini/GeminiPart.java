package com.orbitgard.gemini;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.orbitgard.dto.request.GeminiInlineData;
import jakarta.validation.Valid;
import lombok.Builder;

/**
 * One piece of a message — either an image or a run of text, never both.
 *
 * NON_NULL is not cosmetic here. A part serialised as
 * {"text": "...", "inlineData": null} is not the shape the API expects, so
 * the unused half has to disappear from the JSON entirely.
 *
 * Used on the way out and on the way in, which is why it tolerates unknown
 * fields: responses carry extras that requests never send.
 */
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public record GeminiPart(

        @Valid
        GeminiInlineData inlineData,

        String text
) {

    public static GeminiPart image(String mimeType, String base64Data) {
        return GeminiPart.builder()
                .inlineData(GeminiInlineData.builder().mimeType(mimeType).data(base64Data).build())
                .build();
    }

    public static GeminiPart text(String text) {
        return GeminiPart.builder().text(text).build();
    }
}
