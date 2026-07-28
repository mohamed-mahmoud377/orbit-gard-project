# Orbit Frontend

Angular 20, Tailwind, and SCSS implementation of the Orbit digital-wallet Figma flows. The app
uses a typed, persistent browser mock store, so it runs independently from the Spring backend.
Shared tokens, mixins, and component styles live under `src/styles/`.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4200`.

## Demo accounts

- Parent: `mohamed` / `Orbit@123`
- Child: `youssef` / `Youssef@123`
- Sign-up verification code: `123456`
- Merchant demo: `http://localhost:4200/pay/nile-books`

State persists in local storage. Use **Settings → Reset demo** to restore the original fixtures.

## Implemented flows

- Sign in, sign up, verification, expired-token, and password-reset states
- Parent dashboard, balance breakdown, top-up success/failure, transfers, and transaction details
- Family overview, child creation, funding, spending limits, and child-restricted wallet views
- Public merchant `/pay` flow with pending hold, settlement, and rejection
- Account profile, active session revocation, and password change with global sign-out
- Desktop and mobile navigation shells derived from the Orbit Figma variables and assets

## Quality checks

```bash
npm run lint
npm test
npm run build
npm run e2e
```

Playwright runs the connected parent, child, family, and merchant journeys on desktop Chromium
and a mobile Pixel 7 viewport.
