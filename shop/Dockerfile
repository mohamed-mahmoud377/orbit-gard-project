# syntax=docker/dockerfile:1

# Build context is `shop/` — it holds both halves of Jerry's Shop:
#   web/  Angular storefront (baseHref /shop/, builds to dist/web/browser)
#   api/  Express API that serves BOTH /shop/api/* and the Angular bundle
# One process serves both, which is why there is no CORS anywhere in the shop
# (CONTRACT.md §1).

# ---- Stage 1: build the Angular storefront ----
FROM node:22-alpine AS web
WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
# --base-href is also set in angular.json; repeating it here keeps the image
# correct even if that ever drifts, since a wrong base href silently 404s every
# asset behind nginx's /shop/ prefix.
RUN npm run build -- --configuration=production --base-href=/shop/

# ---- Stage 2: API production dependencies ----
FROM node:22-alpine AS deps
WORKDIR /api

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev

# ---- Runtime ----
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    SHOP_WEB_DIST=/app/web

# `node` (uid 1000) ships with the official image; nothing here is written at
# runtime, so the whole tree can stay owned by it and read-only in practice.
COPY --from=deps --chown=node:node /api/node_modules ./node_modules
COPY --chown=node:node api/package.json ./package.json
# src/ carries the committed catalog.json — a missing catalog is a hard boot
# failure by design (CONTRACT.md §3).
COPY --chown=node:node api/src ./src
COPY --from=web --chown=node:node /web/dist/web/browser ./web

USER node

EXPOSE 4000

# BusyBox wget is part of node:22-alpine (curl is not), so no extra package is
# needed. It exits non-zero on the 503 the health route returns when Postgres is
# unreachable, which is exactly the signal we want.
# start-period covers first boot: CREATE DATABASE + migrations + seeding 500
# products before the port even opens.
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-4000}/shop/api/health" || exit 1

CMD ["node", "src/index.js"]
