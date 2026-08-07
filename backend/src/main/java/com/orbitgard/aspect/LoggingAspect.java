package com.orbitgard.aspect;

import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect
@Component
@Slf4j
public class LoggingAspect {

    @Around("execution(* com.orbitgard.service.Impl..*(..))")
    public Object logServiceMethod(ProceedingJoinPoint joinPoint) throws Throwable {

        long startTime = System.currentTimeMillis();

        String serviceName = joinPoint.getSignature().getDeclaringType().getSimpleName();
        String methodName = joinPoint.getSignature().getName();
        String operation = serviceName + "." + methodName;

        log.info("Calling : {}", operation);

        try {
            Object result = joinPoint.proceed();

            long executionTime = System.currentTimeMillis()- startTime;

            log.info("Successfully Completed: {}", result);
            log.info("Finished {} successfully in {} ms", operation, executionTime);

            return result;
        } catch (Exception e) {

            long executionTime = System.currentTimeMillis()-startTime;

            log.error("Error in {} after {} ms : {}", operation, executionTime, e.getMessage(), e);
            throw e;
        }
    }
}
