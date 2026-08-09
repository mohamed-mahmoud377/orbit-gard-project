package com.orbitgard.config;

import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@SecurityScheme(
        name = "bearerAuth",
        type = SecuritySchemeType.HTTP,
        scheme = "bearer",
        bearerFormat = "JWT"
)
public class OpenApiConfig {

    @Bean
    public OpenAPI orbitOpenApi(@Value("${server.servlet.context-path:/}") String contextPath) {
        return new OpenAPI()
                .info(new Info()
                        .title("Orbit Gard API")
                        .description("Orbit digital wallet REST API")
                        .version("v1"))
                .addServersItem(new Server().url(contextPath).description("API base path"));
    }
}
