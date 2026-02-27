---
name: email
version: 1.0.0
primitive: email.prim.sh
requires: [wallet]
tools:
  - email_create_mailbox
  - email_list_mailboxes
  - email_get_mailbox
  - email_delete_mailbox
  - email_renew_mailbox
  - email_list_messages
  - email_get_message
  - email_send_message
  - email_register_webhook
  - email_list_webhooks
  - email_delete_webhook
  - email_register_domain
  - email_list_domains
  - email_get_domain
  - email_verify_domain
  - email_delete_domain
---

# email.prim.sh

Disposable and custom-domain email for agents. Receive, send, and manage mailboxes with x402 payment.

## When to use

Use email when you need to:
- Create a temporary inbox to receive a verification code or confirmation link
- Send transactional email from an agent-owned address
- Set up a webhook to react to incoming email in real time
- Use a custom domain (e.g. `agent@myproject.com`) for professional outbound mail
- Route inbound messages to an agent via webhook without polling

Do NOT use email for:
- High-volume bulk sending (no bulk send endpoint — each send is a separate x402 payment)
- Long-term archiving (mailboxes expire by default; renew or use no-expiry TTL)
- Spam or unauthorized sending (Stalwart enforces rate limits and DKIM/SPF)

## Prerequisites

- Registered wallet (`wallet_register`)
- Wallet funded with USDC on Base (`faucet_usdc` on testnet)
- Wallet on access allowlist (private beta — if you get 403 `wallet_not_allowed`, request access at `POST https://api.prim.sh/access/request`)

## Common workflows

### 1. Create a temporary inbox and read a verification code

```
1. email_create_mailbox
   - username: "tmpagent"  (optional — omit for random)
   → returns mailbox with id and address (e.g. "tmpagent@mail.prim.sh")

2. [trigger the external service to send to that address]

3. email_list_messages
   - id: <mailbox id from step 1>
   → wait for a message to appear; check total > 0

4. email_get_message
   - id: <mailbox id>
   - msgId: <message id from step 3>
   → read textBody or htmlBody for the verification code
```

### 2. Send an email from an agent-owned address

```
1. email_create_mailbox
   → get mailbox id and address

2. email_send_message
   - id: <mailbox id>
   - to: "user@example.com"
   - subject: "Report ready"
   - body: "Your weekly report is attached."
   → returns {message_id, status: "sent"}
```

### 3. Register a webhook for real-time inbound mail

```
1. email_create_mailbox
   → get mailbox id

2. email_register_webhook
   - id: <mailbox id>
   - url: "https://myagent.example.com/hooks/email"
   - secret: "whsec_abc123"
   - events: ["message.received"]
   → webhook fires when mail arrives; verify X-Prim-Signature with your secret

3. email_list_webhooks
   - id: <mailbox id>
   → confirm webhook is registered and active
```

### 4. Use a custom domain for outbound mail

```
1. email_register_domain
   - domain: "myproject.com"
   → returns required_records (MX, TXT/SPF)

2. [Add required_records to your DNS registrar]

3. email_verify_domain
   - id: <domain id>
   → on success: status becomes "verified", dkim_records returned

4. [Add dkim_records to your DNS]

5. email_create_mailbox
   - domain: "myproject.com"
   - username: "agent"
   → creates "agent@myproject.com"
```

### 5. Renew a mailbox before it expires

```
1. email_get_mailbox
   - id: <mailbox id>
   → check expires_at

2. email_renew_mailbox
   - id: <mailbox id>
   - ttl_ms: 604800000  (7 more days)
   → returns updated expires_at
```

## Error handling

- `invalid_request` (400) → Missing required fields, invalid username/domain characters, or email format error. Check field values.
- `username_taken` (409) → Another mailbox already uses that username on that domain. Omit username to get a random one, or pick a different name.
- `conflict` (409) → Domain already registered, or duplicate webhook URL. List existing resources first.
- `not_found` (404) → Mailbox, message, webhook, or domain does not exist. Verify IDs are correct.
- `forbidden` (403) → Resource belongs to a different wallet. You can only access resources your wallet owns.
- `expired` (410) → Mailbox has expired and can no longer receive messages. Renew with `email_renew_mailbox` or create a new one.
- `stalwart_error` (502) → Upstream Stalwart mail server error. Retry after a short wait.
- `jmap_error` (502) → JMAP message submission failed. Retry after a short wait.

## Gotchas

- **Mailboxes expire by default:** The default TTL is 24 hours. If you need a permanent inbox, create with a very large `ttl_ms` or `null`. Renew with `email_renew_mailbox` before expiry.
- **Either body or html required for send:** `email_send` requires at least one of `body` (plain text) or `html`. Providing both creates a multipart message.
- **Custom domain verification is two-step:** Register → add DNS records → verify. After verification, add the returned `dkim_records` too for DKIM signing. DNS propagation can take minutes to hours.
- **Webhook URLs must be HTTPS:** HTTP webhook URLs are rejected with `invalid_request`.
- **Message listing is position-based:** Use `position` (zero-based offset) to paginate, not cursor-based like store.sh. `total` tells you how many messages exist.
- **One webhook per URL per mailbox:** Registering the same URL twice returns `conflict`. Delete the existing webhook first if you need to update the secret or events.
- **Domain deletion warns but does not block:** Deleting a domain with active mailboxes succeeds but returns a `warning` field. Those mailboxes stop receiving mail.

## Related primitives

- **wallet** — Required. Your wallet identity determines which mailboxes and domains you own.
- **ring** — For real-time messaging without email (when available).
- **store** — Use store to persist received message content for later analysis.
- **spawn** — Spawn a server to host the webhook endpoint that receives email events.
