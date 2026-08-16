# Production deployment

Production runs on `46.224.100.97` under `/root/orbit/`.

## URL layout

| URL | Serves |
|-----|--------|
| `http://46.224.100.97/orbit/` | Angular SPA (login, dashboard, all routes) |
| `http://46.224.100.97/api/ping` | Spring Boot API (proxied by nginx) |
| `http://46.224.100.97/shop/` | Orbit Bazaar storefront + `/shop/api` (proxied by nginx) |
| `http://46.224.100.97/` | Redirects to `/orbit/` |

The frontend uses `baseHref: /orbit/` in production. API calls stay at same-origin
`/api/v1` — no CORS changes are required. Orbit Bazaar uses `baseHref: /shop/` and is
served by its own container, so nginx reverse-proxies `/shop/` rather than serving files.

## Stack

```
Browser → orbit-web (nginx :80)
            ├─ /orbit/*  → static Angular assets
            ├─ /api/*    → orbit-app  (Spring Boot :8080, internal)
            └─ /shop/*   → orbit-shop (Node :4000, internal — no host port)
orbit-app  → orbit-db (Postgres :5432, database "orbit")
orbit-shop → orbit-db (Postgres :5432, database "shop")
           → orbit-app /api/v1/external/* (server-to-server wallet payments)
```

Services are defined in [`docker-compose.yml`](docker-compose.yml). `orbit-shop` creates
the `shop` database itself at boot — the Postgres volume predates it, so
`docker-entrypoint-initdb.d` never runs.

## Environment

Copy [`.env.example`](.env.example) to `/root/orbit/.env` on the server and set
`POSTGRES_PASSWORD`. The deploy workflow injects `APP_IMAGE`, `WEB_IMAGE`, and `SHOP_IMAGE`
on each run.

Also set `SHOP_JWT_SECRET` in `/root/orbit/.env`. It is intentionally separate from the
backend's `JWT_SECRET`: the two sign different things (storefront logins vs. Orbit banking
sessions), and a token minted by one must not be presentable to the other. If it is absent,
compose falls back to a `POSTGRES_PASSWORD`-derived value so the deploy still succeeds.

Image tags:

- Backend: `ghcr.io/mohamed-mahmoud377/orbit-gard-project:backend-latest` (and `:backend-<sha>`)
- Frontend: `ghcr.io/mohamed-mahmoud377/orbit-gard-project:frontend-latest` (and `:frontend-<sha>`)
- Shop: `ghcr.io/mohamed-mahmoud377/orbit-gard-project:shop-latest` (and `:shop-<sha>`)

## CI/CD

Pushes to `main` trigger [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml):

1. Build and push backend + frontend + shop images to GHCR
2. Copy `docker-compose.yml` to the server
3. `docker compose pull && docker compose up -d --remove-orphans`
4. Smoke checks: `/orbit/` → 200, `/api/ping` → JSON, `/` → 302,
   `/shop/api/health` → `{"status":"ok"}` (polled, up to 150s for the first seed),
   `/shop/` → 200

Manual deploy from another branch: trigger the workflow via **Actions → Deploy → Run workflow**.

## Manual operations

```bash
ssh root@46.224.100.97
cd /root/orbit

# Pull latest images and restart
export APP_IMAGE=ghcr.io/mohamed-mahmoud377/orbit-gard-project:backend-latest
export WEB_IMAGE=ghcr.io/mohamed-mahmoud377/orbit-gard-project:frontend-latest
export SHOP_IMAGE=ghcr.io/mohamed-mahmoud377/orbit-gard-project:shop-latest
docker compose pull && docker compose up -d --remove-orphans

# Check status
docker compose ps

# View logs
docker compose logs -f web app shop
```

## Rollback

Re-deploy a known-good SHA tag:

```bash
export APP_IMAGE=ghcr.io/mohamed-mahmoud377/orbit-gard-project:backend-<sha>
export WEB_IMAGE=ghcr.io/mohamed-mahmoud377/orbit-gard-project:frontend-<sha>
export SHOP_IMAGE=ghcr.io/mohamed-mahmoud377/orbit-gard-project:shop-<sha>
docker compose pull && docker compose up -d --remove-orphans
```

## Verification

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://46.224.100.97/orbit/    # 200
curl -fsS http://46.224.100.97/api/ping                                      # ping JSON
curl -fsS -o /dev/null -w '%{http_code}\n' http://46.224.100.97/            # 302
curl -fsS -o /dev/null -w '%{http_code}\n' http://46.224.100.97/shop/     # 200
curl -fsS http://46.224.100.97/shop/api/health                               # {"status":"ok",...}
```

Browser: open `http://46.224.100.97/orbit/` — login page should load with assets under `/orbit/`.

## Auth rollout (future)

When auth APIs merge to `main`, extend `/root/orbit/.env` with `JWT_SECRET` and mail settings,
uncomment the corresponding keys in `docker-compose.yml`, and set `useMockAuth: false` in the
frontend production environment.
