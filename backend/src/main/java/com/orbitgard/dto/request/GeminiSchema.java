package com.orbitgard.dto.request;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Builder;
import lombok.Singular;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The response schema handed to structured output — a small recursive
 * subset of OpenAPI, which is all Gemini accepts.
 *
 * Typed rather than a raw Map so the extraction schema is built in Java
 * and checked by the compiler. A stray key in a hand-written map is
 * ignored silently by the API, and the failure shows up much later as a
 * field that is mysteriously always null.
 *
 * properties uses LinkedHashMap through @Singular so declaration order is
 * preserved, which matters because propertyOrdering is only stable if the
 * two agree.
 */
@Builder
// NON_EMPTY, not NON_NULL: @Singular builds empty collections rather
// than nulls, so a leaf node would otherwise serialise with an empty
// properties map and two empty arrays hanging off it.
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record GeminiSchema(

        /** OBJECT, STRING, BOOLEAN, NUMBER, INTEGER, ARRAY — uppercase. */
        @NotBlank(message = "FIELD_REQUIRED")
        String type,

        Boolean nullable,

        @Valid
        @Singular("property")
        Map<String, GeminiSchema> properties,

        @Singular("requiredField")
        List<String> required,

        @Singular("orderedProperty")
        List<String> propertyOrdering
) {

    public static GeminiSchema string() {
        return GeminiSchema.builder().type("STRING").build();
    }

    public static GeminiSchema nullableString() {
        return GeminiSchema.builder().type("STRING").nullable(true).build();
    }

    public static GeminiSchema bool() {
        return GeminiSchema.builder().type("BOOLEAN").build();
    }

    public static GeminiSchema nullableBool() {
        return GeminiSchema.builder().type("BOOLEAN").nullable(true).build();
    }

    /**
     * Builds an OBJECT schema from an ordered map, deriving
     * propertyOrdering from the same map so the two can never disagree.
     */
    public static GeminiSchema object(LinkedHashMap<String, GeminiSchema> properties,
                                      List<String> required) {
        return GeminiSchema.builder()
                .type("OBJECT")
                .properties(properties)
                .required(required)
                .propertyOrdering(List.copyOf(properties.keySet()))
                .build();
    }
}
