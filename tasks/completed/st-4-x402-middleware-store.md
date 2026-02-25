# ST-4: Integrate x402 middleware for store.sh

## Status: Already Integrated

x402 middleware was integrated as part of ST-1 (bucket CRUD) and ST-2 (object CRUD). No remaining work.

## Evidence

`packages/store/src/index.ts` already:

1. Imports `createAgentStackMiddleware` from `@agentstack/x402-middleware` (line 2)
2. Defines `STORE_ROUTES` with per-endpoint pricing for all 8 paid routes (lines 27-36)
3. Wires middleware globally via `app.use("*", ...)` (lines 57-67)
4. Extracts `walletAddress` from payment context in every route handler
5. Marks `GET /` as a free route (health check)

Pricing map:

| Route | Price |
|-------|-------|
| `POST /v1/buckets` | $0.05 |
| `GET /v1/buckets` | $0.001 |
| `GET /v1/buckets/[id]` | $0.001 |
| `DELETE /v1/buckets/[id]` | $0.01 |
| `PUT /v1/buckets/[id]/objects/*` | $0.001 |
| `GET /v1/buckets/[id]/objects` | $0.001 |
| `GET /v1/buckets/[id]/objects/*` | $0.001 |
| `DELETE /v1/buckets/[id]/objects/*` | $0.001 |

This follows the same pattern as dns.sh (D-1/D-4) and spawn.sh (SP-2/SP-5), where x402 was baked in from the first implementation rather than added as a separate task.

## Recommendation

Mark ST-4 as **done** in TASKS.md. Move this plan doc to `tasks/completed/`.

## Future Consideration

ST-3 (storage quota + usage tracking) may introduce dynamic/metered pricing (per-byte charges for PUT, storage overage fees). That would be scoped under ST-3, not ST-4 — the x402 middleware itself is already wired and functional.
