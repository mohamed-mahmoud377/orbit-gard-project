package com.orbitgard.paymob;

import com.orbitgard.logging.PaymobLoggingInterceptor;
import org.springframework.boot.restclient.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Configuration
public class PaymobConfig {

    @Bean("paymobRestTemplate")
    public RestTemplate paymobRestTemplate(
            RestTemplateBuilder builder,
            PaymobProperties props,
            PaymobLoggingInterceptor loggingInterceptor) {

        return builder
                .requestFactory(() ->
                        new BufferingClientHttpRequestFactory(
                                new SimpleClientHttpRequestFactory()
                        ))
                .additionalInterceptors(loggingInterceptor)
                .connectTimeout(props.getConnectTimeout())
                .readTimeout(props.getReadTimeout())
                .build();
    }
}