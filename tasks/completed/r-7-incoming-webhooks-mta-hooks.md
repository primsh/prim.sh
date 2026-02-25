# R-7: Incoming Mail Webhooks (Stalwart Webhooks + MTA Hooks)

**Status:** pending
**Depends on:** R-2 (done), R-3 (done), R-4 (done)
**Blocks:** — (standalone feature)
**Spec:** `specs/relay.md` (Webhooks section)

## Context

Agents need real-time notification when their mailbox receives email. Currently agents must poll `GET /v1/mailboxes/:id/messages` — expensive and high-latency. R-7 adds webhook subscriptions: an agent registers a callback URL, and relay.sh POSTs a JSON payload to that URL whenever new mail arrives.

Stalwart provides two relevant mechanisms:

1. **Webhooks** (telemetry system) — event-driven HTTP callbacks for server events like `message-ingest.ham`, `message-ingest.spam`. Configured in `webhook.<id>` section. Stalwart POSTs batched events to a URL. Events include metadata (event type, timestamp) but the payload data varies by event type and does not include full message content.

2. **MTA Hooks** (SMTP filter) — HTTP-based milter replacement. Configured in `session.hook.<id>`. Stalwart POSTs the full SMTP transaction (envelope, headers, body) at configurable stages (`connect`, `ehlo`, `mail`, `rcpt`, `data`). The response controls message disposition (accept/reject/discard/quarantine). This is synchronous and in the SMTP delivery path.

### Design choice: Stalwart Webhooks for notification, JMAP for content

**Neither mechanism alone is ideal.** MTA Hooks are synchronous (blocking SMTP delivery) and designed for filtering, not notification — adding latency to every inbound message for webhook fanout is wrong. Stalwart Webhooks provide async notification but don't include full message content in the event payload.

**Approach:**
1. Configure a single Stalwart webhook pointing at relay.sh's internal endpoint, triggered on `message-ingest.ham` and `message-ingest.spam` events
2. When relay.sh receives the Stalwart webhook event, it extracts the recipient address from the event data
3. relay.sh looks up the mailbox by address, finds registered agent webhooks
4. relay.sh fetches the message via JMAP (reuses R-5 `getEmail()`) to build a rich payload
5. relay.sh POSTs the payload to each registered agent webhook URL

This decouples message delivery from webhook fanout. Stalwart delivers mail at full speed; relay.sh handles notification asynchronously.

### Fallback: Polling with JMAP push

If Stalwart's webhook events don't include enough data to identify the recipient (the event payload schema is under-documented), an alternative is to poll via JMAP or use JMAP EventSource. However, Stalwart webhook events for `message-ingest.*` should include at least the account name or recipient — we'll verify during implementation and adjust.

## Architecture

```
Internet → Stalwart SMTP → message ingested → Stalwart webhook fires
  → relay.sh /internal/hooks/ingest (internal endpoint)
    → look up recipient address → mailbox → owner → webhooks table
    → fetch message via JMAP (getEmail)
    → POST to each agent webhook URL (with HMAC signature)
    → record delivery attempt in webhooks_log table
```

**Dependency direction:** `index.ts` → `service.ts` → `db.ts` + `jmap.ts`. New `webhook-worker.ts` handles async delivery. No reverse imports.

## Stalwart Configuration (one-time setup)

Configure via Stalwart Settings API (`POST /api/settings`). This is done once during deployment (or add to `stalwart.ts` as an init function).

```
webhook.relay-ingest.url = https://relay.prim.sh/internal/hooks/ingest
webhook.relay-ingest.events = ["message-ingest.ham", "message-ingest.spam"]
webhook.relay-ingest.timeout = 30s
webhook.relay-ingest.throttle = 1s
webhook.relay-ingest.signature-key = <WEBHOOK_SIGNING_SECRET>
webhook.relay-ingest.allow-invalid-certs = false
```

The `signature-key` lets relay.sh verify that ingest notifications genuinely come from Stalwart. Store the same secret in `STALWART_WEBHOOK_SECRET` env var on the relay.sh side.

### stalwart.ts addition

Add `configureStalwartWebhook()` function that calls `POST /api/settings` to ensure the webhook config exists. Call it at relay.sh startup (idempotent — Stalwart settings API upserts). This avoids requiring manual Stalwart admin configuration.

## API Surface

### Register a webhook

```
POST /v1/mailboxes/:id/webhooks
Request:  { "url": "https://agent.example.com/inbox", "secret": "optional-hmac-key", "events": ["message.received"] }
Response: { "id": "wh_a1b2c3d4", "url": "https://agent.example.com/inbox", "events": ["message.received"], "status": "active", "created_at": "..." }
```

- `url` — required, must be HTTPS (reject HTTP in production)
- `secret` — optional HMAC-SHA256 key. If provided, relay.sh signs payloads with `X-Signature` header
- `events` — optional, defaults to `["message.received"]`. Only `message.received` is supported in R-7; future events: `message.bounced`, `mailbox.expiring`

### List webhooks

```
GET /v1/mailboxes/:id/webhooks
Response: { "webhooks": [...], "total": 2 }
```

### Delete a webhook

```
DELETE /v1/mailboxes/:id/webhooks/:whId
Response: { "id": "wh_a1b2c3d4", "deleted": true }
```

### Internal ingest endpoint (not x402-gated)

```
POST /internal/hooks/ingest
```

Receives Stalwart webhook events. Authenticated via `X-Signature` header (HMAC of request body using `STALWART_WEBHOOK_SECRET`). Not exposed through x402 middleware — this is server-to-server on localhost or internal network.

## Webhook Payload (agent-facing)

When relay.sh delivers to an agent's webhook URL:

```json
{
  "event": "message.received",
  "mailbox_id": "mbx_a7xk9d3f",
  "message_id": "jmap-email-id-string",
  "from": { "name": "Alice", "email": "[email protected]" },
  "to": [{ "name": null, "email": "[email protected]" }],
  "subject": "Re: Your order",
  "preview": "Thanks for your message about...",
  "received_at": "2026-02-25T10:30:00Z",
  "size": 1234,
  "has_attachment": false,
  "timestamp": "2026-02-25T10:30:05Z"
}
```

Headers on the POST:
- `Content-Type: application/json`
- `X-Webhook-Id: wh_a1b2c3d4`
- `X-Signature: <HMAC-SHA256 hex digest>` (if agent provided a `secret`)
- `User-Agent: relay.prim.sh/1.0`

The payload includes metadata only (not full body text). The agent can call `GET /v1/mailboxes/:id/messages/:msgId` to fetch the full message. This keeps webhook payloads small and avoids sending potentially large email bodies to arbitrary URLs.

## DB Schema Additions

### webhooks table

```sql
CREATE TABLE webhooks (
  id            TEXT PRIMARY KEY,           -- "wh_" + 8 hex chars
  mailbox_id    TEXT NOT NULL,              -- FK to mailboxes.id
  owner_wallet  TEXT NOT NULL,              -- denormalized for ownership checks
  url           TEXT NOT NULL,              -- HTTPS callback URL
  secret_enc    TEXT,                       -- AES-256-GCM encrypted HMAC secret (reuse crypto.ts)
  events        TEXT NOT NULL DEFAULT '["message.received"]',  -- JSON array
  status        TEXT NOT NULL DEFAULT 'active',  -- active | paused | disabled
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE
);

CREATE INDEX idx_webhooks_mailbox ON webhooks(mailbox_id);
```

### webhooks_log table

```sql
CREATE TABLE webhooks_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id    TEXT NOT NULL,
  message_id    TEXT,                       -- JMAP email ID that triggered this
  status_code   INTEGER,                    -- HTTP response status from agent
  attempt       INTEGER NOT NULL DEFAULT 1, -- retry attempt number
  delivered_at  INTEGER,                    -- epoch ms when delivered
  error         TEXT,                       -- error message if failed
  created_at    INTEGER NOT NULL
);

CREATE INDEX idx_webhooks_log_webhook ON webhooks_log(webhook_id);
```

Logs are for debugging and delivery auditing. Keep last 100 entries per webhook (prune on insert).

## Service Layer

### Webhook CRUD (service.ts)

**registerWebhook(mailboxId, callerWallet, request)**
1. Verify mailbox ownership (reuse `checkOwnership`)
2. Validate URL: must start with `https://` (or `http://localhost` for dev)
3. Validate events array: only `message.received` allowed in R-7
4. Encrypt secret if provided (reuse `encryptPassword` from `crypto.ts`)
5. Generate `wh_` + 8 hex chars ID
6. Insert into `webhooks` table
7. Return webhook response

**listWebhooks(mailboxId, callerWallet)**
1. Verify mailbox ownership
2. Query `webhooks` where `mailbox_id = ?` and `status = 'active'`
3. Return list (never expose `secret_enc`)

**deleteWebhook(mailboxId, callerWallet, webhookId)**
1. Verify webhook exists, belongs to mailbox, mailbox owned by caller
2. Delete from `webhooks` table
3. Return success

### Ingest Handler (service.ts or new webhook-delivery.ts)

**handleIngestEvent(stalwartEvent)**
1. Verify `X-Signature` matches HMAC of body using `STALWART_WEBHOOK_SECRET`
2. Extract recipient address from event data (field TBD — verify against actual Stalwart event payload)
3. Look up mailbox by address: `SELECT * FROM mailboxes WHERE address = ?`
4. If no mailbox found, ignore (message for unknown address — shouldn't happen if Stalwart is configured correctly)
5. Query `webhooks` for this `mailbox_id` where `status = 'active'`
6. If no webhooks registered, stop (mail is still in mailbox, agent can poll)
7. Fetch message summary via JMAP: use `getJmapContext` + `queryEmails` with limit=1 to get the most recent message. Alternatively, if the Stalwart event includes enough data (from, subject), skip JMAP and build payload from event data.
8. For each webhook: dispatch async delivery

### Webhook Delivery (webhook-delivery.ts)

**deliverWebhook(webhook, payload)**
1. Build JSON payload
2. If `secret_enc` exists, decrypt it, compute `HMAC-SHA256(secret, JSON.stringify(payload))`, set `X-Signature` header
3. POST to `webhook.url` with 10-second timeout
4. Log result to `webhooks_log`
5. On failure: schedule retry

### Retry Logic

Exponential backoff: retry at 10s, 60s, 300s (3 attempts total). After 3 failures, mark delivery as failed in log. Do NOT disable the webhook — transient failures are normal.

Implementation: Use `setTimeout` for in-process retries (good enough for single-instance relay.sh). No external queue needed yet.

| Attempt | Delay | Total elapsed |
|---------|-------|---------------|
| 1       | 0s    | 0s            |
| 2       | 10s   | 10s           |
| 3       | 60s   | 70s           |

If all 3 fail, log as `failed` and move on. The message is still in the mailbox — the agent can poll.

After 10 consecutive failed deliveries across different messages, auto-pause the webhook (`status = 'paused'`). Agent can re-enable by deleting and recreating.

## Inbound Stalwart Event Verification

The `/internal/hooks/ingest` endpoint must verify the request is from Stalwart:

1. Read `X-Signature` header
2. Compute `HMAC-SHA256(STALWART_WEBHOOK_SECRET, raw_request_body)`
3. Compare (constant-time) with provided signature
4. Reject if mismatch (401)
5. Additionally, this endpoint should only be reachable from localhost/internal network — configure via middleware or network policy

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `STALWART_WEBHOOK_SECRET` | (required) | HMAC key shared with Stalwart for verifying ingest events |
| `WEBHOOK_DELIVERY_TIMEOUT_MS` | `10000` | Timeout for agent webhook delivery |
| `WEBHOOK_MAX_RETRIES` | `3` | Max delivery attempts per event |
| `WEBHOOK_CONSECUTIVE_FAILURES_PAUSE` | `10` | Auto-pause after N consecutive failures |

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/db.ts` | Modify | Add `webhooks` + `webhooks_log` tables, CRUD helpers |
| `src/api.ts` | Modify | Add webhook request/response types |
| `src/service.ts` | Modify | Add `registerWebhook`, `listWebhooks`, `deleteWebhook`, `handleIngestEvent` |
| `src/webhook-delivery.ts` | Create | Async webhook delivery with retry logic, HMAC signing |
| `src/stalwart.ts` | Modify | Add `configureStalwartWebhook()` for initial setup |
| `src/index.ts` | Modify | Add 3 webhook CRUD routes + 1 internal ingest route |
| `test/service.test.ts` | Modify | Add webhook CRUD tests + ingest handler tests |
| `test/webhook-delivery.test.ts` | Create | Delivery, retry, HMAC signing tests |

## Ownership Truth Table

```
mailbox_exists | wallet_matches | webhook_exists | result
--------------|----------------|----------------|--------
false          | n/a            | n/a            | not_found (mailbox)
true           | false          | n/a            | not_found (don't leak existence)
true           | true           | false          | not_found (webhook) — for delete only
true           | true           | true           | success
```

## Test Assertions

### service.test.ts — registerWebhook

- Returns webhook with `wh_` prefix ID for valid request
- Returns `not_found` when mailbox not owned by caller
- Returns `invalid_request` when URL is not HTTPS (and not localhost)
- Returns `invalid_request` when events contains unsupported type
- Secret is encrypted in DB (not plaintext)
- Default events = `["message.received"]` when not provided

### service.test.ts — listWebhooks

- Returns only webhooks for owned mailbox
- Returns `not_found` for wrong wallet
- Never exposes `secret_enc` in response
- Only returns `status = 'active'` webhooks

### service.test.ts — deleteWebhook

- Deletes webhook and returns success
- Returns `not_found` for wrong wallet
- Returns `not_found` for non-existent webhook ID

### service.test.ts — handleIngestEvent

- Rejects event with invalid HMAC signature (returns 401)
- Looks up mailbox by recipient address from event
- Ignores events for unknown addresses (returns 200, no error)
- Dispatches delivery for each active webhook on the mailbox
- Does nothing if no webhooks registered (returns 200)

### webhook-delivery.test.ts — deliverWebhook

- POSTs JSON payload to webhook URL with correct headers
- Includes `X-Signature` when secret is configured
- `X-Signature` is HMAC-SHA256 hex digest of JSON body
- Logs successful delivery to `webhooks_log` with status code
- Retries on HTTP 5xx with exponential backoff
- Does NOT retry on HTTP 4xx (client error, permanent failure)
- Logs failed delivery after max retries
- 10-second timeout on delivery request
- Auto-pauses webhook after 10 consecutive failures

### webhook-delivery.test.ts — HMAC signing

- `assert HMAC-SHA256(secret, payload) === X-Signature header value`
- No `X-Signature` header when webhook has no secret
- Constant-time comparison for inbound Stalwart signature verification

## Out of Scope

- **Additional event types** (bounces, expiry warnings) — future task
- **Webhook URL verification** (challenge/response handshake) — defer to hardening pass
- **Fan-out queue** (Redis/NATS) — single-instance setTimeout is sufficient for now
- **Rate limiting on webhook registration** — defer to R-10 (x402 handles abuse via payment)
- **Full message body in webhook payload** — agents fetch via API to keep payloads small

## Before Closing

- [ ] Run `pnpm --filter @agentstack/relay check` (lint + typecheck + test)
- [ ] Run `pnpm -r test` (full workspace)
- [ ] Verify Stalwart webhook configuration is applied via Settings API (test against running instance or mock)
- [ ] Verify ingest endpoint rejects requests with invalid/missing HMAC signature
- [ ] Verify webhook secret is encrypted in DB (never stored plaintext)
- [ ] Verify HMAC signing: `HMAC-SHA256(secret, JSON.stringify(payload))` matches `X-Signature`
- [ ] For every ownership check, verify both `wallet_matches=true` and `wallet_matches=false` paths tested
- [ ] Verify retry backoff timing: 0s, 10s, 60s
- [ ] Verify auto-pause after 10 consecutive failures
- [ ] Verify webhook deletion cascades when mailbox is deleted (FK ON DELETE CASCADE)
- [ ] Verify `/internal/hooks/ingest` is NOT gated by x402 middleware
