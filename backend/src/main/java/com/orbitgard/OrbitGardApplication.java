package com.orbitgard;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class OrbitGardApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrbitGardApplication.class, args);
    }
}
