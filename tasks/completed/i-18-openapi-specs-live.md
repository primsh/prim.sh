# I-18: OpenAPI Specs — Live Prims

**Status:** pending
**Goal:** Write OpenAPI 3.1 specs for all 6 live primitives (wallet, store, spawn, faucet, search, email). These specs are the single source from which MCP tools, CLI commands, OpenAI functions, and llms.txt are generated.
**Depends on:** I-8 (prim.yaml schema V2 — operation_id + request/response type refs in routes_map)
**Scope:** `specs/openapi/{wallet,store,spawn,faucet,search,email}.yaml`
**Absorbs:** Wave 5.5 L-62

## Context

This is the irreducible manual work in the Prim Factory initiative. Everything downstream (I-12 MCP gen, I-13 CLI gen, I-14 OpenAI gen) consumes these specs. The specs must be complete enough that generated interfaces are production-ready without manual editing.

An existing draft exists for email (`specs/openapi/email.yaml` — untracked). The other 5 need writing from scratch.

## Spec Standard

Every spec must follow OpenAPI 3.1 and include:

### Required per-spec

- `openapi: "3.1.0"`
- `info:` with title, version, description, x-prim-id
- `servers:` with production URL (`https://<id>.prim.sh`)
- `paths:` with every public route (exclude `/v1/admin/*` and `/internal/*`)
- `components/securitySchemes:` with x402 payment scheme
- `components/schemas:` with all request/response types

### Required per-endpoint

- `operationId` matching prim.yaml `operation_id`
- `summary` (one line) and `description` (detailed)
- `x-price` extension field (e.g. `"$0.01"`, or `"free"`)
- `requestBody` with full JSON Schema: properties, types, required, constraints (min/max, pattern, enum), field descriptions
- `responses` for 200/201 (success), 400 (invalid_request), 402 (payment_required), 404 (not_found if applicable), 429 (rate_limited), 500/502 (server/provider error)
- `examples` for request and success response

### x402 Security Scheme

Define once per spec, reference on all paid endpoints:

```yaml
securitySchemes:
  x402:
    type: http
    scheme: x402
    description: |
      Payment via x402 protocol. Send request → receive 402 with payment details →
      sign EIP-3009 authorization → retry with X-PAYMENT header.
```

### Error Envelope

All errors follow:
```yaml
ErrorResponse:
  type: object
  required: [error]
  properties:
    error:
      type: object
      required: [code, message]
      properties:
        code: { type: string }
        message: { type: string }
        retryAfter: { type: number, description: "Seconds to wait (429 only)" }
```

### Pagination

List endpoints use:
```yaml
# Request params
limit: { type: integer, minimum: 1, maximum: 100, default: 20 }
cursor: { type: string, description: "Opaque cursor from previous response" }

# Response shape
PaginatedList:
  properties:
    items: { type: array, items: { $ref: ... } }
    cursor: { type: string, nullable: true }
    is_truncated: { type: boolean }
```

## Source Data Per Prim

| Prim | api.ts lines | Routes | Key types |
|------|-------------|--------|-----------|
| wallet | ~280 | 18 (12 public) | WalletRegisterRequest, WalletListResponse, SpendingPolicy, FundRequest |
| store | ~180 | 12 | CreateBucketRequest, BucketResponse, ObjectListResponse |
| spawn | ~200 | 13 | CreateServerRequest, ServerResponse, ServerStatus, SshKeyResponse |
| faucet | ~60 | 4 | FaucetRequest, FaucetResponse, FaucetStatusResponse |
| search | ~80 | 4 | SearchRequest, SearchResponse, ExtractRequest, ExtractResponse |
| email | ~210 | 17 | CreateMailboxRequest, EmailMessage, WebhookPayload, DomainResponse |

### Special cases

- **wallet** has admin routes (`/v1/admin/allowlist/*`) and internal routes (`/internal/*`). Exclude from public spec. Create separate `wallet-admin.yaml` only if needed.
- **faucet** has no x402 payment (free service with rate limiting). Skip x402 security scheme. Document rate limit in spec.
- **email** draft already exists — review and complete to standard.

## Validation

After writing each spec:
```bash
npx @redocly/cli lint specs/openapi/<id>.yaml
```

Cross-check every operationId against the actual Hono route handler in `src/index.ts` to confirm request/response shapes match.

## Files to Create

| File | Status |
|------|--------|
| `specs/openapi/wallet.yaml` | Create |
| `specs/openapi/store.yaml` | Create |
| `specs/openapi/spawn.yaml` | Create |
| `specs/openapi/faucet.yaml` | Create |
| `specs/openapi/search.yaml` | Create |
| `specs/openapi/email.yaml` | Review/complete existing draft |

## Testing Strategy

- `npx @redocly/cli lint specs/openapi/*.yaml` passes for all 6
- Every operationId maps to a real route handler
- Every required request field is actually validated in the handler
- Every response schema matches what the service actually returns

## Before Closing

- [ ] All 6 specs lint clean with redocly
- [ ] Every endpoint in each prim's index.ts has a corresponding path in the spec
- [ ] x-price on every paid endpoint matches the ROUTES const in index.ts
- [ ] Error envelope consistent across all specs
- [ ] Pagination schema matches HRD-8 standard
- [ ] Examples are realistic and would succeed against a live service
