# R-11: relay.sh local smoke test against live Stalwart

**Status**: done
**Depends on**: R-6 (done), R-10 (done)
**Scope**: `packages/relay/`

## Goal

A single vitest integration test that exercises the full relay.sh flow against a live Stalwart instance: create mailbox → send email (to self) → read inbox → webhook delivery. Runs manually (not in CI), requires an SSH tunnel to Stalwart.

## Context

All existing relay tests mock Stalwart/JMAP. This is the first test that hits real infrastructure. It validates that our Stalwart REST API wrapper, JMAP session discovery, email send/receive, and webhook dispatch all work end-to-end.

## Design

### File: `packages/relay/test/smoke-live.test.ts`

Single file. **No mocks.** Calls service functions directly (not via HTTP/Hono). Since R-10 added real x402 payment middleware to `index.ts`, going through the Hono app would require valid EVM payment signatures and facilitator verification — impractical for a local smoke test.

### x402 bypass — call service layer directly

R-10 (`4358c74`) wired `createAgentStackMiddleware` into `index.ts`. The middleware calls the x402 facilitator (`x402.org`) and verifies EVM payment headers before setting `walletAddress`. This means:

- ~~Wrapping the app with a test middleware~~ — won't work; the x402 middleware runs first and 402-rejects unpaid requests before our wrapper can inject a wallet.
- **Instead**: import service functions (`createMailbox`, `listMessages`, `sendMessage`, etc.) directly from `service.ts` and call them with a fake wallet string. This tests the full Stalwart + JMAP + SQLite integration while cleanly bypassing the payment layer.

The x402 middleware itself is already tested separately (P-5 testnet integration). The smoke test's job is to validate the Stalwart/JMAP integration, not payment flow.

For the **ingest endpoint** (which is `freeRoutes` — no x402), we can still use the Hono app directly:

```ts
import app from "../src/index.ts";
// Only for the ingest endpoint (free route, no x402):
app.request("/internal/hooks/ingest", { method: "POST", ... });
```

### Webhook receiver

Spin up a local HTTP server (Bun.serve) inside the test to receive webhook callbacks. Register its URL as the webhook endpoint. After sending an email to self, poll/wait for the webhook to arrive.

### Test flow (single `describe` block, sequential steps)

1. **Health check** — `GET /` via `app.request()` returns `{ service: "relay.sh", status: "ok" }` (free route, no x402).
2. **Create mailbox** — `createMailbox({}, WALLET)`. Assert `ok: true`, data has `id`, `address`, `status: "active"`, `expires_at` in future.
3. **List mailboxes** — `listMailboxes(WALLET, 1, 25)`. Assert the new mailbox appears.
4. **Register webhook** — `registerWebhook(id, WALLET, { url, secret })` with local server URL + secret. Assert `ok: true`.
5. **Send email to self** — `sendMessage(id, WALLET, { to: address, subject, body })`. Assert `ok: true`, `status: "sent"`.
6. **Wait for delivery** — Stalwart delivers locally (same server), but there's propagation delay. Poll `listMessages(id, WALLET, { folder: "inbox" })` every 500ms for up to 10s until `total > 0`.
7. **Read message** — `getMessage(id, WALLET, msgId)`. Assert subject/body match what was sent.
8. **Simulate ingest + verify webhook** — POST to `/internal/hooks/ingest` via `app.request()` (free route). Then check local HTTP server received a POST with `event: "message.received"`, correct `mailbox_id`, valid `X-Signature`.
9. **Delete mailbox** — `deleteMailbox(id, WALLET)`. Assert `ok: true`, `deleted: true`.
10. **Verify cleanup** — `getMailbox(id, WALLET)` returns `ok: false`, code `not_found`.

### Webhook verification caveat

Webhook delivery depends on Stalwart calling `POST /internal/hooks/ingest` when mail arrives. This requires Stalwart to be configured with an MTA hook pointing at the relay.sh instance. In a local smoke test, Stalwart may not be configured to call back to localhost.

**Two options:**

- **Option A**: Configure Stalwart's MTA hook to point at `http://localhost:3456/internal/hooks/ingest` (the relay.sh dev server). The smoke test starts relay.sh on that port. Webhook delivery happens naturally.
- **Option B**: After confirming the email arrived in inbox (step 6), manually call the ingest endpoint to simulate Stalwart's webhook, then verify downstream webhook delivery.

**Recommendation**: Option B — it's self-contained and doesn't require Stalwart config changes. The test simulates the ingest event after confirming JMAP delivery succeeded. This still validates the full webhook pipeline (signature verification → DB lookup → async dispatch → HTTP delivery).

### Environment

Required env vars (set before running):

| Var | Purpose | Example |
|-----|---------|---------|
| `STALWART_API_URL` | Stalwart admin API (via SSH tunnel) | `http://localhost:8080` |
| `STALWART_API_CREDENTIALS` | Admin creds (`user:pass`) | `admin:secretpass` |
| `STALWART_JMAP_URL` | JMAP endpoint (via SSH tunnel) | `http://localhost:8443` |
| `RELAY_ENCRYPTION_KEY` | 64 hex chars for AES key | `aabbcc...` (64 chars) |
| `RELAY_DB_PATH` | SQLite path (use temp) | `/tmp/relay-smoke.db` |
| `RELAY_ALLOW_HTTP_WEBHOOKS` | Allow http:// webhook URLs | `1` |
| `STALWART_WEBHOOK_SECRET` | HMAC secret for ingest | `test-secret` |

### Running

```bash
# 1. SSH tunnel to Stalwart (in another terminal)
ssh -L 8080:localhost:8080 -L 8443:localhost:443 stalwart-host

# 2. Run the smoke test
STALWART_API_URL=http://localhost:8080 \
STALWART_API_CREDENTIALS=admin:password \
STALWART_JMAP_URL=http://localhost:8443 \
RELAY_ENCRYPTION_KEY=$(openssl rand -hex 32) \
RELAY_DB_PATH=/tmp/relay-smoke.db \
RELAY_ALLOW_HTTP_WEBHOOKS=1 \
STALWART_WEBHOOK_SECRET=test-secret \
pnpm -F @agentstack/relay exec vitest --run test/smoke-live.test.ts
```

Add a `test:smoke` script to `packages/relay/package.json` that runs only this file. Regular `pnpm test` excludes it (vitest config or filename convention).

### Vitest config

The existing `vitest --run` picks up all `*.test.ts`. To exclude the live smoke test from normal runs, use vitest's `exclude` config or add a `test:smoke` script that targets only this file. The file should be excluded from the default test glob.

**Approach**: Add to `packages/relay/package.json`:
```json
"test:smoke": "vitest --run test/smoke-live.test.ts"
```

And update `test` script to exclude it:
```json
"test": "vitest --run --exclude test/smoke-live.test.ts"
```

## Files to modify

| File | Change |
|------|--------|
| `packages/relay/test/smoke-live.test.ts` | **New** — the integration test |
| `packages/relay/package.json` | Add `test:smoke` script, exclude live test from `test` |

## Testing strategy

- The test is itself the deliverable — it validates the full stack
- Pass criteria: all 10 steps complete without error against a live Stalwart
- Failure modes to handle gracefully: Stalwart unreachable (skip with clear message), JMAP auth failure, webhook timeout

## Before closing

- [ ] Run `pnpm -r check` (lint + typecheck + test) — unit tests still pass
- [ ] Run `test:smoke` against live Stalwart — full flow completes
- [ ] Verify `pnpm test` excludes the smoke test (no Stalwart required)
- [ ] TASKS.md updated to `done`
