# Orbit Gard

Spring Boot service wired up to PostgreSQL. No domain entities yet — the schema is
managed by Flyway migrations that you add over time.

## Stack

- Java 25
- Spring Boot 4.0.7 (`spring-boot-starter-web`, `spring-boot-starter-data-jpa`)
- PostgreSQL
- Flyway (`spring-boot-flyway` + `flyway-database-postgresql`) for schema migrations
- Maven (via the included wrapper — no local Maven install required)

Hibernate runs with `ddl-auto: validate`, so it never creates or alters tables —
Flyway owns the schema.

## Prerequisites

- JDK 25 on your `PATH` (or `JAVA_HOME` pointing at it)
- A running PostgreSQL instance

## Run PostgreSQL

A `compose.yaml` is included:

```bash
docker compose up -d
```

This starts Postgres on `localhost:5432` with database/user/password `orbit` / `orbit` / `orbit123`.

## Configuration

Settings live in `src/main/resources/application.yml` and can be overridden via env vars:

| Variable       | Default                                     |
|----------------|---------------------------------------------|
| `DB_URL`       | `jdbc:postgresql://localhost:5432/orbit`    |
| `DB_USERNAME`  | `orbit`                                      |
| `DB_PASSWORD`  | `orbit123`                                   |
| `SERVER_PORT`  | `8080`                                       |
| `JPA_DDL_AUTO` | `validate`                                   |

## Build & run

```bash
./mvnw clean package      # build + run tests
./mvnw spring-boot:run    # run the app
```

The first `./mvnw` invocation downloads Maven automatically.

## Adding tables (Flyway)

Put migration scripts in `src/main/resources/db/migration`, named
`V<version>__<description>.sql`. Flyway applies them in version order on startup.

```sql
-- src/main/resources/db/migration/V1__create_products.sql
CREATE TABLE products (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    price       NUMERIC(12, 2) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Health check

| Method | Path        | Description  |
|--------|-------------|--------------|
| GET    | `/api/ping` | Liveness ping |

```bash
curl http://localhost:8080/api/ping
# {"service":"orbit-gard","status":"ok"}
```
