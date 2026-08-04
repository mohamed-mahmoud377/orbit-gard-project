package com.orbitgard.paymob;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Data
@Configuration
@ConfigurationProperties(prefix = "orbitgard.paymob")
public class PaymobProperties {
    private String baseUrl = "https://accept.paymob.com";
    private String secretKey;
    private String publicKey;
    private String callbackUrl;
    private String notificationUrl;
    private List<Integer> paymentMethodIds = new ArrayList<>();
    private Duration connectTimeout = Duration.ofSeconds(5);
    private Duration readTimeout = Duration.ofSeconds(20);
}