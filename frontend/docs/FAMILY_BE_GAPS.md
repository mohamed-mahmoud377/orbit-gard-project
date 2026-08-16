# Family APIs — backend gaps for FE

Share with the backend team. Parent-side Family integration uses existing `/family/*`, `/auth/add-child`, and `/wallet/internal/transfer`.

## Blocking child wallet UI

1. **No child self-view spending limits API** — `/family/*` returns 403 for `CHILD` role. Child wallet pages need today/month/per-transaction progress. **Request:** `GET /wallet/spending-limits` or `GET /me/limits` for children (shape like `LimitWindowResponse` + `perTransaction`), with UTC window semantics documented.

2. **No parent display name for child** — Child shell subtitle hardcodes a parent name. **Request:** `funderName` or `parentDisplayName` on profile or wallet for `CHILD` role.

## UX / data quality (parent flows can ship without these)

3. **Rejection `reason` always null** — `ChildTransactionResponse.reason` is always null; no rejection reason persisted in schema.

4. **`blockedAttempts` semantics** — `GET /family/overview` counts **REJECTED** transactions this month, not limit-specific blocks. UI label “Blocked by limits” may mislead until `BLOCKED` status or distinguishable rejection reasons exist.

5. **UTC limit windows** — Daily/monthly spend uses UTC. FE shows “Resets at midnight” without timezone. Document in OpenAPI or add `resetsAt` / timezone fields.

6. **Merchant display** — Activity titles parse merchant from payment description strings; fragile. Prefer persisted `merchantName` on transactions.

7. **Internal transfer not scoped to children** — `POST /wallet/internal/transfer` accepts any active Orbit username, not only the parent’s children.

8. **No dedicated allocate endpoint** — Parent funding uses generic internal transfer to child username (acceptable; document in API guide).

9. **`childrenCount` on `GET /users/me`** — Redundant with `GET /family/overview`; FE currently uses overview only.

## Covered by current APIs

- Family summary bar — `GET /family/overview`
- Child cards with limit progress — `GET /family/children`
- Child detail + remaining headroom — `GET /family/children/{id}`
- Edit limits — `PATCH /family/children/{id}/limits`
- Parent-view child activity — `GET /family/children/{id}/transactions`
- Create child — `POST /auth/add-child` with limits + optional `startingAllocation`
