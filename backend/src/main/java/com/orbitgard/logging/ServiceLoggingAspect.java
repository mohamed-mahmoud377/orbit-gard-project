package com.orbitgard.logging;

import com.orbitgard.config.LoggingProperties;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect
@Component
@Slf4j
public class ServiceLoggingAspect {

    private final LoggingProperties properties;

    public ServiceLoggingAspect(LoggingProperties properties) {
        this.properties = properties;
    }

    @Around("execution(* com.orbitgard.service..*(..))")
    public Object logServiceMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        if (!properties.enabled()) {
            return joinPoint.proceed();
        }

        String methodName = joinPoint.getSignature().getName();
        long start = System.currentTimeMillis();

        log.info("Enter: {}()", methodName);
        try {
            Object result = joinPoint.proceed();
            log.info("Exit: {}()  [Took {} ms]", methodName, System.currentTimeMillis() - start);
            return result;
        } catch (Throwable ex) {
            // Exit + timing must still appear even when the method throws.
            log.info("Exit: {}()  [Took {} ms]", methodName, System.currentTimeMillis() - start);
            throw ex;
        }
    }
}