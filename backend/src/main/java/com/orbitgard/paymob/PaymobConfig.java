package com.orbitgard.paymob;

import org.springframework.boot.restclient.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class PaymobConfig {

    @Bean("paymobRestTemplate")
    public RestTemplate paymobRestTemplate(RestTemplateBuilder builder, PaymobProperties props) {
        return builder
                .connectTimeout(props.getConnectTimeout())
                .readTimeout(props.getReadTimeout())
                .build();
    }
}
