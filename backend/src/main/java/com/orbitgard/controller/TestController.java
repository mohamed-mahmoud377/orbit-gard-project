package com.orbitgard.controller;

import com.orbitgard.service.AuthenticatedUserService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/test")
public class TestController {

    private final AuthenticatedUserService authenticatedUserService;

    public TestController(AuthenticatedUserService authenticatedUserService) {
        this.authenticatedUserService = authenticatedUserService;
    }

    @GetMapping("/hi")
    public Map<String, String> hi() {
        return Map.of("message", "hi " + authenticatedUserService.currentUsername());
    }
}
