# Orbit

Orbit is a digital-wallet graduation project organized as a small monorepo.

## Production

- **Frontend:** [http://46.224.100.97/orbit/](http://46.224.100.97/orbit/)
- **API health:** [http://46.224.100.97/api/ping](http://46.224.100.97/api/ping)

The production stack runs on `46.224.100.97` via Docker Compose (nginx + Angular + Spring Boot +
Postgres). Pushes to `main` build both container images and deploy automatically. See
[`backend/deploy/README.md`](backend/deploy/README.md) for server ops, env vars, and rollback.

```
Browser → nginx (:80)
            ├─ /orbit/*  → Angular SPA
            └─ /api/*    → Spring Boot (:8080, internal)
Spring Boot → Postgres (:5432)
```

## Projects

- [`frontend/`](frontend/) — Angular web application and mock wallet flows.
- [`backend/`](backend/) — existing Spring Boot service and PostgreSQL setup.

## Backend

The backend was moved without changing its application behavior. See
[`backend/README.md`](backend/README.md) for prerequisites and commands.

```bash
cd backend
docker compose up -d
./mvnw spring-boot:run
```

## Frontend

Frontend setup, demo accounts, and commands are documented in
[`frontend/README.md`](frontend/README.md).
