# Orbit

Orbit is a digital-wallet graduation project organized as a small monorepo.

## Production

- **Frontend:** [http://46.224.100.97/orbit/](http://46.224.100.97/orbit/)
- **API health:** [http://46.224.100.97/api/ping](http://46.224.100.97/api/ping)
- **Jerry's Shop (shop):** [http://46.224.100.97/shop/](http://46.224.100.97/shop/)

The production stack runs on `46.224.100.97` via Docker Compose (nginx + Angular + Spring Boot +
Node + Postgres). Pushes to `main` build all three container images and deploy automatically. See
[`backend/deploy/README.md`](backend/deploy/README.md) for server ops, env vars, and rollback.

```
Browser → nginx (:80)
            ├─ /orbit/*  → Angular SPA
            ├─ /api/*    → Spring Boot (:8080, internal)
            └─ /shop/*   → Jerry's Shop (Node :4000, internal)
Spring Boot   → Postgres (:5432, database "orbit")
Jerry's Shop  → Postgres (:5432, database "shop") + Spring Boot /api/v1/external/*
```

## Projects

- [`frontend/`](frontend/) — Angular web application and mock wallet flows.
- [`backend/`](backend/) — existing Spring Boot service and PostgreSQL setup.
- [`shop/`](shop/) — **Jerry's Shop**, a storefront that pays with the Orbit wallet
  (Angular + Node/Express, one container serving both).

## Jerry's Shop

A 500-product storefront at [`/shop/`](http://46.224.100.97/shop/) with card and Orbit-wallet
checkout. Every wallet call is server-to-server, so no credential or token ever reaches the
browser. Local setup, env vars, test cards, and the payment flow are in
[`shop/README.md`](shop/README.md); the binding API/UI spec is [`shop/CONTRACT.md`](shop/CONTRACT.md).

```bash
docker compose -f shop/docker-compose.dev.yml up --build   # → http://localhost:4000/shop/
```

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
