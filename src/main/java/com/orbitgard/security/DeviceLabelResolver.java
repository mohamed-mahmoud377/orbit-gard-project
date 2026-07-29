package com.orbitgard.security;

import org.springframework.stereotype.Component;

@Component
public class DeviceLabelResolver {

    public String resolve(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return "Unknown device";
        }
        String browser = detectBrowser(userAgent);
        String os = detectOs(userAgent);
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

    private String detectBrowser(String userAgent) {
        if (userAgent.contains("Edg/")) {
            return "Edge";
        }
        if (userAgent.contains("OPR/") || userAgent.contains("Opera")) {
            return "Opera";
        }
        if (userAgent.contains("Chrome/")) {
            return "Chrome";
        }
        if (userAgent.contains("Firefox/")) {
            return "Firefox";
        }
        if (userAgent.contains("Safari/")) {
            return "Safari";
        }
        return null;
    }

    private String detectOs(String userAgent) {
        if (userAgent.contains("Windows")) {
            return "Windows";
        }
        if (userAgent.contains("Mac OS X") || userAgent.contains("Macintosh")) {
            return "macOS";
        }
        if (userAgent.contains("Android")) {
            return "Android";
        }
        if (userAgent.contains("iPhone") || userAgent.contains("iPad") || userAgent.contains("iOS")) {
            return "iOS";
        }
        if (userAgent.contains("Linux")) {
            return "Linux";
        }
        return null;
    }
}
