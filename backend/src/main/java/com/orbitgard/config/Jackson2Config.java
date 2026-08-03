package com.orbitgard.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Provides the Jackson 2 mapper used by the Paymob integration.
 *
 * Spring Boot 4 auto-configures Jackson 3, while the Paymob payload models use
 * Jackson 2 annotations and the JJWT dependency supplies the Jackson 2 API.
 */
@Configuration
public class Jackson2Config {

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper();
    }
}
