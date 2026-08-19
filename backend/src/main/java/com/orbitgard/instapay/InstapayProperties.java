package com.orbitgard.instapay;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.math.BigDecimal;
import java.time.Duration;

@Data
@Configuration
@ConfigurationProperties(prefix = "orbitgard.instapay")
public class InstapayProperties {

    private String accountName = "Mohamed Mahmoud Said";
    private String accountNumber = "01111545710";
    private String uploadsDir = "uploads";
    private long maxImageBytes = 1048576; // 1 MB
    private BigDecimal minAmount = new BigDecimal("0.01");
    private BigDecimal maxAmount = new BigDecimal("70000.00");
    private int receiptMaxAgeDays = 7;
    private Job job = new Job();

    @Data
    public static class Job {
        private boolean enabled = true;
        private Duration fixedDelay = Duration.ofSeconds(30);
        private int batchSize = 5;
        private int maxAttempts = 3;
    }
}
