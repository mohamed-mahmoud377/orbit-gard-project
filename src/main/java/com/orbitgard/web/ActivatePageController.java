package com.orbitgard.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ActivatePageController {

    @GetMapping("/activate")
    public String activate() {
        return "forward:/activate.html";
    }
}
