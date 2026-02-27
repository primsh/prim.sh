# email.sh

> Mailboxes on demand. Send, receive, webhook. Disposable or permanent.

Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/mailboxes` | Create a mailbox. Optional: username, domain, ttl_ms. | $0.05 | `CreateMailboxRequest` | `MailboxResponse` |
| `GET /v1/mailboxes` | List mailboxes owned by the calling wallet (paginated) | $0.001 | `—` | `MailboxListResponse` |
| `GET /v1/mailboxes/:id` | Get mailbox metadata including expires_at | $0.001 | `—` | `MailboxResponse` |
| `DELETE /v1/mailboxes/:id` | Permanently delete a mailbox and all messages | $0.01 | `—` | `DeleteMailboxResponse` |
| `POST /v1/mailboxes/:id/renew` | Extend mailbox TTL by ttl_ms milliseconds | $0.01 | `RenewMailboxRequest` | `MailboxResponse` |
| `GET /v1/mailboxes/:id/messages` | List messages in a mailbox, newest first | $0.001 | `—` | `EmailListResponse` |
| `GET /v1/mailboxes/:id/messages/:msgId` | Get full message including textBody and htmlBody | $0.001 | `—` | `EmailDetail` |
| `POST /v1/mailboxes/:id/send` | Send email from a mailbox. Requires to, subject, and body or html. | $0.01 | `SendMessageRequest` | `SendMessageResponse` |
| `POST /v1/mailboxes/:id/webhooks` | Register a webhook URL for message.received events. Optional secret for HMAC signing. | $0.01 | `RegisterWebhookRequest` | `WebhookResponse` |
| `GET /v1/mailboxes/:id/webhooks` | List webhooks for a mailbox | $0.001 | `—` | `WebhookListResponse` |
| `DELETE /v1/mailboxes/:id/webhooks/:whId` | Delete a webhook | $0.001 | `—` | `DeleteWebhookResponse` |
| `POST /v1/domains` | Register a custom domain. Returns required_records for DNS. | $0.05 | `RegisterDomainRequest` | `DomainResponse` |
| `GET /v1/domains` | List registered custom domains (paginated) | $0.001 | `—` | `DomainListResponse` |
| `GET /v1/domains/:id` | Get domain details and verification status | $0.001 | `—` | `DomainResponse` |
| `POST /v1/domains/:id/verify` | Verify DNS records. On success: status → verified, dkim_records returned. | $0.01 | `—` | `VerifyDomainResponse` |
| `DELETE /v1/domains/:id` | Remove a custom domain registration | $0.01 | `—` | `DeleteDomainResponse` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Create mailbox | $0.05 | 24h TTL included |
| Send email | $0.01 | Up to 10MB |
| Read messages | $0.001 | Per request |
| Webhook | $0.01 | Setup + 3 retries |
| Custom domain | $0.05 | DNS verification required |

## Request / Response Types

### `CreateMailboxRequest`

| Field | Type | Required |
|-------|------|----------|
| `username` | `string` | optional |
| `domain` | `string` | optional |
| `ttl_ms` | `number` | optional |

### `MailboxResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Mailbox ID (e.g. "mbx_abc123"). |
| `address` | `string` | Full email address (e.g. "abc123@mail.prim.sh"). |
| `username` | `string` | Username portion of the email address. |
| `domain` | `string` | Domain portion of the email address. |
| `status` | `MailboxStatus` | Current status: "active" | "expired" | "deleted". |
| `created_at` | `string` | ISO 8601 timestamp when the mailbox was created. |
| `expires_at` | `string | null` | ISO 8601 timestamp when the mailbox expires. Null if permanent. |

### `DeleteMailboxResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Mailbox ID that was deleted. |
| `deleted` | `true` | Always true on success. |

### `RenewMailboxRequest`

| Field | Type | Required |
|-------|------|----------|
| `ttl_ms` | `number` | optional |

### `EmailDetail`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Message ID. |
| `from` | `EmailAddress` | Sender address. |
| `to` | `EmailAddress[]` | Recipient addresses. |
| `subject` | `string` | Email subject line. |
| `received_at` | `string` | ISO 8601 timestamp when the message was received. |
| `size` | `number` | Message size in bytes. |
| `has_attachment` | `boolean` | Whether the message has attachments. |
| `preview` | `string` | Short preview text (first ~100 chars of body). |
| `cc` | `EmailAddress[]` | CC recipient addresses. |
| `text_body` | `string | null` | Plain-text body. Null if not present. |
| `html_body` | `string | null` | HTML body. Null if not present. |

### `SendMessageRequest`

| Field | Type | Required |
|-------|------|----------|
| `to` | `string` | required |
| `subject` | `string` | required |
| `body` | `string` | optional |
| `html` | `string` | optional |
| `cc` | `string` | optional |
| `bcc` | `string` | optional |

### `SendMessageResponse`

| Field | Type | Description |
|-------|------|-------------|
| `message_id` | `string` | Message ID assigned by the mail server. |
| `status` | `"sent"` | Always "sent" on success. |

### `RegisterWebhookRequest`

| Field | Type | Required |
|-------|------|----------|
| `url` | `string` | required |
| `secret` | `string` | optional |
| `events` | `string[]` | optional |

### `WebhookResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Webhook ID (e.g. "wh_abc123"). |
| `url` | `string` | Webhook endpoint URL. |
| `events` | `string[]` | Subscribed events. |
| `status` | `string` | Webhook status. |
| `created_at` | `string` | ISO 8601 timestamp when the webhook was created. |

### `DeleteWebhookResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Webhook ID that was deleted. |
| `deleted` | `true` | Always true on success. |

### `RegisterDomainRequest`

| Field | Type | Required |
|-------|------|----------|
| `domain` | `string` | required |

### `DomainResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Domain registration ID. |
| `domain` | `string` | Registered domain name. |
| `status` | `string` | Verification status ("pending" | "verified"). |
| `owner_wallet` | `string` | Ethereum address of the domain owner. |
| `created_at` | `string` | ISO 8601 timestamp when the domain was registered. |
| `verified_at` | `string | null` | ISO 8601 timestamp when the domain was verified. Null if unverified. |
| `required_records` | `DnsRecord[]` | DNS records that must be added to verify the domain. |
| `dkim_records` | `DnsRecord[]` | DKIM DNS records. Only present after successful verification. |

### `VerifyDomainResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Domain registration ID. |
| `domain` | `string` | Domain name. |
| `status` | `string` | Updated verification status. |
| `verified_at` | `string | null` | ISO 8601 timestamp when the domain was verified. Null if not yet verified. |
| `verification_results` | `VerificationResult[]` | Per-record verification results. |
| `dkim_records` | `DnsRecord[]` | DKIM records to add to DNS. Only present on successful verification. |

### `DeleteDomainResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Domain registration ID that was deleted. |
| `deleted` | `true` | Always true on success. |
| `warning` | `string` | Warning message if domain had active mailboxes. |

## Providers

| Provider | Status | Default |
|----------|--------|---------|
| [stalwart](https://stalw.art/) | active | yes |

## Usage

```bash
# Install
curl -fsSL https://email.prim.sh/install.sh | sh

# Example request
curl -X POST https://email.prim.sh/v1/mailboxes \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_PAY_TO`
- `PRIM_NETWORK`
- `STALWART_URL`
- `STALWART_API_KEY`
- `EMAIL_DEFAULT_DOMAIN`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3006)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
