# auth.sh — OAuth-as-a-Service for Agents

## Problem

Agents need access to third-party services (Google, GitHub, Slack, AWS, etc.) but OAuth flows are designed for humans in browsers. The agent can't click "Approve" on a consent screen. Today this means:

1. Human manually creates API keys/tokens
2. Pastes them into env vars or config files
3. Tokens expire, agent breaks, human re-does the flow
4. No audit trail, no scoping, no revocation

## Solution

auth.sh is an OAuth broker. It hosts callback URLs, manages token lifecycle, and gives agents a simple API. The human's involvement is one click.

## Core Flow

```
Agent                        auth.sh                      Google (etc.)
  │                            │                              │
  ├─ POST /v1/oauth/start ────►│                              │
  │  {provider, scopes}        │                              │
  │                            │                              │
  │◄── {approval_url,          │                              │
  │     session_id}            │                              │
  │                            │                              │
  │  (sends URL to human       │                              │
  │   via email/slack/terminal)│                              │
  │                            │                              │
  │                     Human clicks URL                      │
  │                            │──── redirect ───────────────►│
  │                            │                    consent screen
  │                            │◄─── callback + auth code ────│
  │                            │                              │
  │                            │──── exchange code ──────────►│
  │                            │◄─── access + refresh token ──│
  │                            │                              │
  │                            │  (encrypts, stores tokens)   │
  │                            │                              │
  ├─ GET /v1/oauth/:id/status ►│                              │
  │◄── {status: "approved"}    │                              │
  │                            │                              │
  ├─ GET /v1/oauth/:id/token ─►│                              │
  │◄── {access_token, expires} │  (auto-refreshes if needed)  │
  │                            │                              │
```

## API Surface

### Start OAuth flow

```
POST /v1/oauth/start
{
  "provider": "google",
  "scopes": ["https://www.googleapis.com/auth/postmaster.readonly"],
  "label": "postmaster-monitoring",
  "notify": "hello@email.prim.sh"     // optional: send approval URL via email.sh
}

→ 201
{
  "session_id": "oauth_a1b2c3",
  "approval_url": "https://auth.prim.sh/approve/oauth_a1b2c3",
  "expires_at": "2026-02-25T22:00:00Z",  // 1 hour to approve
  "status": "pending"
}
```

If `notify` is provided, auth.sh calls email.sh to send the approval link. The agent doesn't need to handle delivery.

### Check status (poll or webhook)

```
GET /v1/oauth/:session_id/status

→ 200
{
  "status": "approved",           // pending | approved | expired | revoked
  "provider": "google",
  "scopes": ["postmaster.readonly"],
  "approved_at": "2026-02-25T21:05:00Z"
}
```

Or register a webhook:
```
POST /v1/oauth/start
{
  ...
  "webhook_url": "https://my-agent.example.com/oauth-callback"
}
```

### Get access token

```
GET /v1/oauth/:session_id/token

→ 200
{
  "access_token": "ya29.a0ARrdaM...",
  "token_type": "Bearer",
  "expires_at": "2026-02-25T22:05:00Z"
}
```

auth.sh auto-refreshes expired tokens using the stored refresh token. The agent always gets a valid access token. If the refresh token is revoked, status changes to `revoked`.

### List active sessions

```
GET /v1/oauth/sessions

→ 200
{
  "sessions": [
    {
      "session_id": "oauth_a1b2c3",
      "provider": "google",
      "label": "postmaster-monitoring",
      "status": "approved",
      "scopes": ["postmaster.readonly"],
      "created_at": "...",
      "last_used_at": "..."
    }
  ]
}
```

### Revoke

```
DELETE /v1/oauth/:session_id

→ 200
{"revoked": true}
```

Calls the provider's revocation endpoint AND deletes stored tokens.

## Providers

Each provider needs a registered OAuth app (client_id + client_secret) on auth.sh's side.

### Launch providers

| Provider | Use case | OAuth type |
|----------|----------|------------|
| Google | Postmaster Tools, Gmail, GCP | OAuth 2.0 + PKCE |
| GitHub | Repo access, org management | OAuth 2.0 |

### Future providers

| Provider | Use case |
|----------|----------|
| Slack | Messaging, workspace access |
| Discord | Bot management |
| Twitter/X | Posting, reading |
| AWS | IAM temporary credentials (STS, not OAuth — different flow) |
| Stripe | Payment management |
| Cloudflare | DNS, Workers, R2 |

AWS is special — it uses STS AssumeRole, not OAuth. auth.sh could support non-OAuth credential delegation as a separate flow.

## Approval Page

`https://auth.prim.sh/approve/oauth_a1b2c3` is a simple page:

- Shows: which agent (wallet address), which provider, which scopes
- "This agent is requesting access to: Google Postmaster Tools (read-only)"
- "Approve" button → redirects to provider consent screen
- "Deny" button → marks session as expired

The agent's wallet address is the identity. The human sees exactly what the agent is asking for.

## Security Model

- **Tokens encrypted at rest.** AES-256-GCM, same pattern as email.sh JMAP passwords.
- **Scoped access.** Agent requests specific scopes. auth.sh enforces them.
- **Wallet-bound.** Sessions are owned by the wallet that created them. No cross-wallet access.
- **Revocable.** Human or agent can revoke anytime. Revocation hits the provider's endpoint too.
- **Approval expiry.** Pending sessions expire after 1 hour. No stale approval links.
- **Refresh token rotation.** If the provider supports it (Google does), auth.sh rotates refresh tokens on each use.
- **No password storage.** auth.sh never sees the human's password. OAuth consent screen is on the provider's domain.

## Token Storage

Two options:

1. **auth.sh stores tokens itself** (SQLite, encrypted). Simpler. auth.sh is the vault for OAuth tokens specifically.
2. **auth.sh delegates to vault.sh.** More modular but adds a dependency and round-trip.

Recommendation: option 1 for v1. OAuth tokens are a specific, well-scoped secret type. A general-purpose vault adds complexity without clear benefit here. If vault.sh exists later, auth.sh can migrate storage.

## Pricing

| Endpoint | Price | Rationale |
|----------|-------|-----------|
| POST /v1/oauth/start | $0.05 | Creates session, sends notification |
| GET /v1/oauth/:id/status | $0.001 | Read |
| GET /v1/oauth/:id/token | $0.005 | Token fetch + potential refresh |
| GET /v1/oauth/sessions | $0.001 | Read |
| DELETE /v1/oauth/:id | $0.01 | Revocation |

## Composability

auth.sh is the enabler for other primitives:

- **email.sh** — agent needs Google Postmaster Tools → auth.sh gets Google OAuth → agent reads deliverability data
- **browse.sh** — agent needs to drive a GUI → auth.sh provides session cookies/tokens → browse.sh authenticates
- **code.sh** — agent needs GitHub access to clone/push → auth.sh gets GitHub OAuth
- Any future primitive that wraps a third-party API with user-owned data

## What auth.sh Is NOT

- **Not an identity provider.** It doesn't issue JWTs or manage users. Wallet address = identity (handled by wallet.sh).
- **Not a password manager.** It stores OAuth tokens, not passwords. Passwords are the human's problem.
- **Not a gateway/proxy.** It doesn't proxy API calls. It gives the agent a token; the agent calls the API directly.

## Open Questions

1. **Multi-human approval.** Can an agent request approval from multiple humans? (e.g., team admin must approve GitHub org access). v1: no. Single approver per session.
2. **Cross-agent token sharing.** Can agent A use a token approved for agent B? v1: no. Tokens are wallet-bound.
3. **Provider app registration.** auth.sh needs OAuth apps registered with each provider. Google requires domain verification + consent screen review for sensitive scopes. This is a one-time setup per provider, done by the prim.sh team.
