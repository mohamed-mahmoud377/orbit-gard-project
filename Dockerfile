# syntax=docker/dockerfile:1

# ---- Build stage: compile and run tests (H2, no external DB needed) ----
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /workspace

# Resolve dependencies first so they cache across builds
COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline

COPY src/ src/
# BuildKit cache mount keeps the local Maven repo between builds
RUN --mount=type=cache,target=/root/.m2 mvn -B clean package

# ---- Runtime stage: slim JRE ----
FROM eclipse-temurin:25-jre
WORKDIR /app

# curl is used by the container healthcheck
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /workspace/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
