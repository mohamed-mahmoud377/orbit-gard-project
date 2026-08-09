package com.orbitgard.config;

import com.orbitgard.security.JwtAuthenticationFilter;
import com.orbitgard.exceptions.ApiProblemResponseWriter;
import com.orbitgard.exceptions.ErrorCode;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;

@Configuration
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ApiProblemResponseWriter problemResponseWriter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter, ApiProblemResponseWriter problemResponseWriter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.problemResponseWriter = problemResponseWriter;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, ex) ->
                                problemResponseWriter.write(request, response, ErrorCode.UNAUTHENTICATED,
                                        "A valid access token is required to access this resource."))
                        .accessDeniedHandler((request, response, ex) ->
                                problemResponseWriter.write(request, response, ErrorCode.ACCESS_DENIED,
                                        "You do not have permission to access this resource.")))
                .authorizeHttpRequests(auth -> auth
                        // Paths here are relative to server.servlet.context-path
                        // (/api/v1) -- Spring Security matches against the
                        // post-context-path path, so no /api/v1 prefix belongs here.
                        // Only these five are documented as requiring no auth.//
                        .requestMatchers(HttpMethod.GET, "/auth/username-available", "/auth/promo-code").permitAll()
                        .requestMatchers(HttpMethod.POST,
                                "/auth/register",
                                "/auth/verify",
                                "/auth/verify/resend",
                                "/auth/login",
                                // Not documented in the contract yet ("not on this page
                                // yet"), but logically must stay anonymous: refresh is
                                // exactly what you call once the access token has
                                // already expired, so requiring a valid one to reach it
                                // would be circular. Confirm this against the contract
                                // once /auth/refresh is actually written up.
                                "/auth/refresh"
                        ).permitAll()
                        // Exact path, not a wildcard -- this is the only endpoint
                        // the Paymob integration guide defines. Both the browser
                        // GET return and the server POST notification land here.
                        .requestMatchers("/payments/webhook/paymob").permitAll()
                        // Container/deploy healthcheck hits /api/v1/ping (context-path
                        // /api/v1 + HealthController's /ping). Must stay anonymous or the
                        // healthcheck gets 403 and the container is marked unhealthy.
                        .requestMatchers(HttpMethod.GET, "/ping").permitAll()
                        // API documentation is public so consumers can inspect
                        // the contract and use Swagger UI's Authorize button to
                        // supply a bearer token for protected operations.
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        // Everything else -- including /auth/logout and
                        // /auth/sessions/** once they exist -- requires a valid
                        // access token by default, with no change needed here
                        // when they're added.
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
