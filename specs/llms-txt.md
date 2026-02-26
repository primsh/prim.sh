# llms.txt Spec

> The primary interface for agents. The landing pages are for humans. This is for machines.

## What It Does

Every agentstack page exists in two forms:
1. **HTML** — For humans who discover agentstack via search/social
2. **llms.txt / markdown** — For agents and LLMs who need to understand and use the primitives

The llms.txt file is the front door. An LLM fetching `agentstack.sh/llms.txt` should be able to discover every primitive, understand what it does, and know how to call its API — without ever rendering HTML.

## Implementation

### /llms.txt (root)

Navigation-level overview. Links to each primitive's detailed docs.

```markdown
# AgentStack

> The agent-native stack. Infrastructure primitives for autonomous agents.
> No signup. No GUI. No KYC. x402 payment is the only credential.

AgentStack provides 26 independent infrastructure primitives. Each accepts
x402 payment (USDC on Base) as authentication. An agent with a funded wallet
can consume any primitive without human intervention.

Payment: All endpoints return HTTP 402 with payment requirements. Use any
x402-compatible client (@x402/fetch for TypeScript, x402 for Python) to
handle payments automatically.

Chain: Base (eip155:8453). Token: USDC.

## Core Primitives

- [wallet.sh](https://agentstack.sh/wallet/llms.txt): Crypto wallets, x402 payments, funding
- [relay.sh](https://agentstack.sh/relay/llms.txt): Email — create mailboxes, send, receive
- [spawn.sh](https://agentstack.sh/spawn/llms.txt): VPS provisioning
- [store.sh](https://agentstack.sh/store/llms.txt): Object storage (S3-compatible)
- [vault.sh](https://agentstack.sh/vault/llms.txt): Secrets management
- [dns.sh](https://agentstack.sh/dns/llms.txt): Domains + auto-TLS
- [cron.sh](https://agentstack.sh/cron/llms.txt): Scheduled jobs
- [pipe.sh](https://agentstack.sh/pipe/llms.txt): Pub/sub messaging
- [code.sh](https://agentstack.sh/code/llms.txt): Sandboxed code execution

## Communication

- [ring.sh](https://agentstack.sh/ring/llms.txt): Phone/SMS
- [browse.sh](https://agentstack.sh/browse/llms.txt): Headless browser sessions

## Intelligence

- [mem.sh](https://agentstack.sh/mem/llms.txt): Vector memory / RAG
- [infer.sh](https://agentstack.sh/infer/llms.txt): Model proxy (OpenAI-compatible)
- [seek.sh](https://agentstack.sh/seek/llms.txt): Web search
- [docs.sh](https://agentstack.sh/docs/llms.txt): API documentation for machines

## Operations

- [watch.sh](https://agentstack.sh/watch/llms.txt): Observability
- [trace.sh](https://agentstack.sh/trace/llms.txt): Distributed tracing
- [auth.sh](https://agentstack.sh/auth/llms.txt): Managed OAuth for third-party APIs
- [id.sh](https://agentstack.sh/id/llms.txt): Agent reputation + trust

## Physical World

- [pins.sh](https://agentstack.sh/pins/llms.txt): Geolocation / places
- [mart.sh](https://agentstack.sh/mart/llms.txt): Buy physical goods
- [ship.sh](https://agentstack.sh/ship/llms.txt): Shipping / logistics
- [hands.sh](https://agentstack.sh/hands/llms.txt): On-demand human labor
- [pay.sh](https://agentstack.sh/pay/llms.txt): Fiat payment bridge
- [corp.sh](https://agentstack.sh/corp/llms.txt): Legal entity formation

## Optional

- [hive.sh](https://agentstack.sh/hive/llms.txt): Agent social graph
- [ads.sh](https://agentstack.sh/ads/llms.txt): Context-targeted ads
```

### Per-primitive llms.txt

Each primitive gets its own `/{primitive}/llms.txt` with:

1. One-paragraph description
2. Base URL
3. Authentication method (always x402)
4. Every endpoint with method, path, request body, response body
5. Pricing table
6. Example curl commands

Example for relay.sh:

```markdown
# relay.sh

> Email for agents. Create mailboxes, send, receive, webhook. x402 auth.

Base URL: https://api.relay.sh
Auth: x402 (USDC on Base, eip155:8453)

## Endpoints

### POST /v1/mailboxes
Create a new email mailbox.
Cost: $0.01

Request:
  {"domain": "relay.sh", "ttl": 86400}

Response:
  {"id": "mbx_7xk9", "address": "[email protected]", "expires": "2026-02-24T..."}

### POST /v1/mailboxes/:id/send
Send an email.
Cost: $0.005

Request:
  {"to": "[email protected]", "subject": "Hello", "body": "..."}

Response:
  {"message_id": "msg_abc", "status": "queued"}

...
```

### /llms-full.txt

All primitive docs concatenated into one file. For agents with large context windows that want everything at once.

## serve.py Changes

Add routes for llms.txt files:

```python
ROUTES['/llms.txt'] = os.path.join(BASE, 'llms.txt')
# Per-primitive:
ROUTES['/wallet/llms.txt'] = os.path.join(BASE, 'wallet', 'llms.txt')
ROUTES['/relay/llms.txt'] = os.path.join(BASE, 'relay', 'llms.txt')
# ... etc
```

Or better: add a catch-all that serves `{primitive}/llms.txt` if the file exists.

## Landing Page Update

Add to every HTML landing page, in the hero section:

```html
<div class="sub">
  <strong>This page is for humans.</strong> The API is for agents.
  Agents: read <a href="/llms.txt">/llms.txt</a>
</div>
```

This reinforces the brand: the customer is the agent, not the human.
