package com.orbitgard.paymob;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class PaymobConfig {

    @Bean("paymobRestTemplate")
    public RestTemplate paymobRestTemplate(RestTemplateBuilder builder, PaymobProperties props) {
        return builder
                .setConnectTimeout(props.getConnectTimeout())
                .setReadTimeout(props.getReadTimeout())
                .build();
    }
}
