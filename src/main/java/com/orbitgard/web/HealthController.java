package com.orbitgard.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    @GetMapping("/api/ping")
    public Map<String, String> ping() {
        return Map.of("status", "ok", "service", "orbit graduation project is working fine on the remote server");
    }
}
