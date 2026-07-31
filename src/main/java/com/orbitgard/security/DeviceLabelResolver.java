package com.orbitgard.security;

import org.springframework.stereotype.Component;
import ua_parser.Client;
import ua_parser.Parser;

@Component
public class DeviceLabelResolver {

    private static final String UNKNOWN_FAMILY = "Other";

    private final Parser uaParser = new Parser();

    public String resolve(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return "Unknown device";
        }

        Client client = uaParser.parse(userAgent);

        String browser = familyOrNull(client.userAgent.family);
        String os = familyOrNull(client.os.family);

        if (browser == null && os == null) {
            return "Unknown device";
        }
        if (browser == null) {
            return os;
        }
        if (os == null) {
            return browser;
        }
        return browser + " on " + os;
    }

    private String familyOrNull(String family) {
        if (family == null || family.isBlank() || UNKNOWN_FAMILY.equals(family)) {
            return null;
        }
        return family;
    }
}