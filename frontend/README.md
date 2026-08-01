# Orbit Frontend

Angular 20, Tailwind, and SCSS implementation of the Orbit digital-wallet Figma flows.

Authentication (ORB-001 / ORB-002 / ORB-003) is wired to the Identity and Authentication API
contract through an `AuthFacade`. By default the app uses a contract-faithful **mock gateway**
so every acceptance path works before the Spring APIs are deployed. Wallet/money screens still
use the local demo store until those APIs exist.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4200`. Development builds proxy `/api` to `http://localhost:8080`
via `proxy.conf.json`.

## Production

Production is served at [http://46.224.100.97/orbit/](http://46.224.100.97/orbit/) with
`baseHref: /orbit/` and `deployUrl: /orbit/`. The nginx container proxies `/api/*` to Spring Boot
at the domain root, so `apiBaseUrl: '/api/v1'` works same-origin without a path prefix.

`useMockAuth` remains `true` in production until auth APIs are deployed on the server.

## Auth mode switch

Configured in:

- `src/environments/environment.development.ts`
- `src/environments/environment.ts`

| Flag | Meaning |
|------|---------|
| `useMockAuth: true` | Default. Uses `MockAuthGateway` (no backend required). |
| `useMockAuth: false` | Calls `HttpAuthGateway` against `apiBaseUrl` (`/api/v1`). |

When APIs are deployed, set `useMockAuth: false` and confirm the cutover checklist below.

## Mock auth accounts

- Parent: `mohamed` / `Orbit@123`
- Child: `youssef` / `Youssef@123`
- Merchant demo: `http://localhost:4200/pay/nile-books` (requires an active signed-in session)

After sign-up, the mock gateway exposes the latest activation token on
`window.__orbitLastVerifyToken` for local testing. Activation route:

`http://localhost:4200/activate?token=<token>&email=<email>`

Production activation links should use `https://<host>/orbit/activate?token=…`.

## Implemented auth flows

- Sign up with first/last name, username availability, Egyptian mobile, password rules, promo code capture
- Check-inbox + resend with 2-minute countdown driven by `retryAfterSeconds`
- Email activation via `/activate?token=…` (`POST /auth/verify`) — never auto-signs in
- Username-only sign-in, remember-me payload, generic credential failures, unverified-account handling
- Bearer access-token interceptor and local session store (refresh/logout APIs intentionally not invented yet)

Out of scope for this release: password reset APIs, child-specific sign-in story, refresh/logout,
and device session management endpoints.

## Backend deployment cutover checklist

Before flipping `useMockAuth` to `false`:

1. Registration is served at `POST /api/v1/auth/register` (not `/api/auth/register`).
2. All five controllers exist on one deployed branch:
   - `GET /api/v1/auth/username-available`
   - `POST /api/v1/auth/register`
   - `POST /api/v1/auth/verify`
   - `POST /api/v1/auth/verify/resend`
   - `POST /api/v1/auth/login`
3. Base URL / port matches the Angular proxy or `apiBaseUrl`.
4. CORS permits the frontend origin (`http://localhost:4200` in development).
5. Failures return `application/problem+json` with the documented `code` and `fieldErrors`.
6. Sign-in currently sends **username only** (literal contract field). Revisit if product later
   accepts email in the same field.

## Quality checks

```bash
npm run lint
npm test
npm run build
npm run e2e
```

Playwright covers login landing, credential failures, signup → activate → sign-in, unverified
login blocking, parent/child wallet shells, and merchant payment with an explicit session.
