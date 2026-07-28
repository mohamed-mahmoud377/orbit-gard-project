# Orbit

Orbit is a digital-wallet graduation project organized as a small monorepo.

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
