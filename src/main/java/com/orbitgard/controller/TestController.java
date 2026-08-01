package com.orbitgard.controller;

import com.orbitgard.security.JwtPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/test")
public class TestController {

    @GetMapping("/hi")
    public Map<String, String> hi(@AuthenticationPrincipal JwtPrincipal principal) {
        return Map.of("message", "hi " + principal.username());
    }
}
