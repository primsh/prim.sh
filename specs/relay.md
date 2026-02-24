# relay.sh Spec

> Email for agents. Create mailboxes, send, receive, webhook. No signup.

## What It Does

relay.sh gives agents their own email addresses with zero human setup:

- **Create mailbox** — `POST /v1/mailboxes` → agent gets `agent-7xk@relay.sh` instantly
- **Send email** — Agent sends email to any address on the internet
- **Receive email** — Incoming mail hits a webhook or is queryable via API
- **Disposable or persistent** — TTL-based mailboxes (default 24h) or persistent (paid renewal)
- **Custom domains** — Bring your own domain or use `*.relay.sh` subdomains

## Architecture

```
Agent
    ↓
relay.sh API (Hono + x402 middleware)
    ↓
┌─────────────────────────────────────┐
│  relay.sh wrapper                    │
│                                      │
│  Account lifecycle ←→ Stalwart REST  │  (create/delete mailboxes)
│  Send email       ←→ Stalwart JMAP  │  (Email/set + EmailSubmission/set)
│  Read email       ←→ Stalwart JMAP  │  (Email/query + Email/get)
│  Incoming mail    ←→ Stalwart Hooks  │  (MTA Hook at data stage)
│  Domain setup     ←→ Stalwart REST  │  (domain principal + DKIM)
│                                      │
│  OAuth token cache (per-mailbox)     │
│  Wallet→Mailbox ownership map        │
│  TTL/expiry manager                  │
└─────────────────────────────────────┘
    ↓
Stalwart Mail Server (Docker, single instance to start)
    ↓
Internet (SMTP inbound/outbound)
```

## Stalwart Integration Details

### Why Stalwart

- All-in-one: SMTP + IMAP + JMAP + REST management in one Rust binary
- REST API for programmatic account/domain management (no SMTP needed for admin)
- JMAP for send/receive over HTTP+JSON (no SMTP client needed in the wrapper)
- MTA Hooks for incoming mail webhooks (HTTP-based, intercepts at SMTP `data` stage)
- Auto DKIM/SPF/DMARC record generation via API
- ACME auto-TLS
- Docker-native, single volume mount

### Auth Bridge

Stalwart has two auth systems:
- **API keys** — Management REST API only (create accounts, domains, DKIM). Cannot access JMAP.
- **OAuth tokens** — JMAP access (send/read email). Per-user.

relay.sh holds:
- One admin API key for provisioning (management API)
- Per-mailbox OAuth tokens for JMAP operations (cached, auto-refreshed)

When relay.sh creates a mailbox, it also obtains and caches an OAuth token for that user so it can make JMAP calls on the mailbox's behalf.

## API Surface

### Mailbox Lifecycle

```
POST   /v1/mailboxes                     # Create mailbox
  Request:  { "domain": "relay.sh", "ttl": 86400 }   ← optional, defaults shown
  Response: { "id": "mbx_7xk9", "address": "[email protected]", "expires": "..." }

GET    /v1/mailboxes                     # List mailboxes (owned by caller's wallet)
GET    /v1/mailboxes/:id                 # Get mailbox details
DELETE /v1/mailboxes/:id                 # Destroy mailbox immediately
POST   /v1/mailboxes/:id/renew          # Extend TTL (payment required)
```

### Send

```
POST   /v1/mailboxes/:id/send
  Request: {
    "to": "[email protected]",
    "subject": "Your order shipped",
    "body": "Tracking: ...",
    "html": "<p>Tracking: ...</p>",      ← optional
    "attachments": [...]                   ← optional, base64-encoded
  }
  Response: { "message_id": "msg_abc", "status": "queued" }
```

Under the hood: relay.sh authenticates as the mailbox user via JMAP OAuth, calls `Email/set` (create draft) + `EmailSubmission/set` (send) in a single JMAP batch request.

### Receive / Read

```
GET    /v1/mailboxes/:id/messages        # List messages (newest first)
  Query: ?limit=20&after=<cursor>
  Response: { "messages": [...], "cursor": "..." }

GET    /v1/mailboxes/:id/messages/:msg   # Get full message (headers + body)
DELETE /v1/mailboxes/:id/messages/:msg   # Delete message
```

Under the hood: JMAP `Email/query` + `Email/get` with back-references.

### Webhooks (Incoming Mail)

```
POST   /v1/mailboxes/:id/webhook
  Request: { "url": "https://my-agent.dns.sh/inbox", "secret": "hmac-key" }
  Response: { "webhook_id": "wh_xyz" }

DELETE /v1/mailboxes/:id/webhook/:wh_id  # Remove webhook
```

When email arrives at the mailbox, relay.sh:
1. Receives the MTA Hook callback from Stalwart (at the SMTP `data` stage)
2. Parses sender, recipient, subject, body from the hook payload
3. Matches recipient to mailbox → wallet → webhook URL
4. POSTs a JSON payload to the agent's webhook URL
5. Includes HMAC signature in `X-Signature` header for verification

Webhook payload:
```json
{
  "mailbox_id": "mbx_7xk9",
  "message_id": "msg_abc",
  "from": "[email protected]",
  "to": "[email protected]",
  "subject": "Re: Your order",
  "text_body": "...",
  "html_body": "...",
  "received_at": "2026-02-23T..."
}
```

### Custom Domains

```
POST   /v1/domains
  Request: { "domain": "mail.myagent.com" }
  Response: {
    "domain_id": "dom_xyz",
    "status": "pending_dns",
    "dns_records": [
      { "type": "MX", "name": "mail.myagent.com", "value": "relay.sh", "priority": 10 },
      { "type": "TXT", "name": "mail.myagent.com", "value": "v=spf1 include:relay.sh ~all" },
      { "type": "TXT", "name": "dkim._domainkey.mail.myagent.com", "value": "v=DKIM1; k=rsa; p=..." },
      { "type": "TXT", "name": "_dmarc.mail.myagent.com", "value": "v=DMARC1; p=quarantine" }
    ]
  }

GET    /v1/domains/:id/verify           # Check if DNS records are configured
```

Under the hood: Creates a domain principal in Stalwart, generates DKIM via `POST /api/dkim`, fetches required DNS records via `GET /api/dns/records/{domain}`.

## Pricing

| Action | Cost | Notes |
|--------|------|-------|
| Create mailbox | $0.01 | Includes 24h TTL |
| Renew mailbox | $0.001/day | Extend TTL |
| Send email | $0.005 | Per message |
| Receive (read) | $0.001 | Per message fetch |
| Webhook delivery | Free | Included with mailbox |
| Custom domain | $0.10 | One-time setup |

## Deliverability Strategy

This is the hardest part. Anonymous email sending = spam magnet.

### Phase 1: Receive-only (ship first)

- Mailboxes can receive email from anyone
- Sending is disabled initially
- This is immediately useful: agent signs up for services, receives verification codes, reads responses
- Zero deliverability risk (no outbound mail)

### Phase 2: Sending with guardrails

- Enable outbound sending with strict rate limits (10 emails/day per mailbox)
- Require warming: new mailboxes can only send to verified recipients for first 7 days
- All outbound goes through dedicated IPs with proper DKIM/SPF/DMARC
- Monitor bounce rates, spam complaints. Auto-suspend mailboxes that trigger abuse thresholds.
- Start with a single sending IP and warm it over 4-6 weeks

### Phase 3: Reputation at scale

- Multiple sending IPs in rotation
- IP reputation monitoring (via Google Postmaster, Microsoft SNDS)
- Content scanning (basic spam check before sending)
- Sender reputation tied to wallet address (via id.sh integration)

## Deployment

### Initial (single VPS)

```
VPS (Hetzner)
├── relay.sh API (Hono on Bun, port 3001)
├── Stalwart (Docker)
│   ├── SMTP (25, 587, 465)
│   ├── JMAP (443)
│   └── Management API (8080, internal only)
├── SQLite (relay.sh state: mailbox→wallet mapping, webhooks, TTLs)
└── Reverse proxy (Caddy or nginx)
    ├── api.relay.sh → relay.sh API
    └── mail.relay.sh → Stalwart SMTP/JMAP
```

### DNS Requirements

For `relay.sh` domain:
- MX record pointing to the VPS
- SPF, DKIM, DMARC records (auto-generated by Stalwart)
- A/AAAA records for the VPS IP
- ACME handles TLS automatically

## Unknowns

1. **MTA Hook payload schema** — Stalwart's MTA Hook documentation doesn't fully specify the JSON schema at the `data` stage. Need to test against a running instance.
2. **OAuth token lifecycle** — How long do Stalwart OAuth tokens last? Do they auto-expire? Need to implement refresh logic.
3. **Mailbox-to-wallet mapping** — If an agent creates a mailbox, then its wallet runs out of funds, what happens to the mailbox? Freeze? Grace period? Delete?
4. **Abuse prevention** — Beyond rate limits, do we need content filtering? CAN-SPAM compliance for outbound? Probably yes for sending phase.
5. **JMAP library choice** — Write raw HTTP+JSON against Stalwart's JMAP endpoint using Bun's native `fetch` (simpler, full control) vs use `jmap-client-ts` library (less code, potential limitations). Leaning toward raw fetch — JMAP is just POST with JSON bodies.
