---
name: create-prim
version: 1.0.0
description: Generate a valid prim.yaml for a new prim.sh primitive from a natural language description.
---

# create-prim skill

Given a description of a new primitive, generate a complete `prim.yaml` that can be consumed by `pnpm create-prim <id>` to scaffold the package.

## What to produce

A `prim.yaml` file at `packages/<id>/prim.yaml`. After generating it, offer to run `pnpm create-prim <id>` to scaffold the package files.

## prim.yaml schema

Required fields:

```yaml
id: <string>           # lowercase letters/digits/hyphens, e.g. "ring"
name: <string>         # display name, e.g. "ring.sh"
endpoint: <string>     # production endpoint, e.g. "ring.prim.sh"
status: building       # always "building" for new prims
type: <string>         # see type categories below
description: <string>  # ~120 chars, plain english
port: <integer>        # see port allocation below
accent: <hex>          # 6-digit hex, e.g. "#FF5722"
accent_dim: <hex>      # accent darkened ~20%, e.g. "#cc3f00"
accent_glow: <rgba>    # rgba(r,g,b,0.08), e.g. "rgba(255,87,34,0.08)"
env:
  - PRIM_PAY_TO
  - PRIM_NETWORK
  - <PROVIDER_API_KEY>   # if wrapping a vendor
  - WALLET_INTERNAL_URL
```

Optional but recommended fields:

```yaml
wraps: <string>        # upstream service being wrapped, e.g. "Twilio API"
pricing:
  - op: <description>
    price: "$0.01"     # or "free"
    note: "Per request"
providers:
  - name: <vendor>
    env: [VENDOR_API_KEY]
    status: active
    default: true
    url: https://vendor.com/
interfaces:
  mcp: true
  cli: true
  tools: true
  rest: true
factory:
  max_body_size: "1MB"
  metrics: true
  free_service: false
routes_map:
  - route: "POST /v1/<action>"
    request: <TypeName>Request
    response: <TypeName>Response
    status: 200
    description: "<what this route does>"
    operation_id: <snake_case_action>
    errors:
      - { status: 400, code: invalid_request, description: "Missing or invalid input" }
      - { status: 402, code: payment_required, description: "x402 payment needed" }
      - { status: 429, code: rate_limited, description: "Too many requests" }
      - { status: 502, code: provider_error, description: "Upstream provider error" }
```

## Type categories

Use one of the established types or introduce a new one if none fit:

| Type | Examples |
|------|---------|
| crypto | wallet |
| storage | store |
| compute | spawn |
| search | search |
| email | email |
| testnet | faucet |
| defi | token |
| memory | mem |
| domains | domain |
| logistics | track |
| communication | ring, pipe |
| intelligence | infer, seek, docs |
| operations | watch, trace, auth, id |
| physical | pins, mart, ship |
| social | hive, ads |

## Port allocation

Assigned ports — do NOT reuse these:

| Primitive | Port |
|-----------|------|
| wallet    | 3001 |
| store     | 3002 |
| faucet    | 3003 |
| spawn     | 3004 |
| search    | 3005 |
| email     | 3006 |
| token     | 3007 |
| mem       | 3008 |
| domain    | 3009 |
| track     | 3010 |

New primitives start at **3011** and increment. To find the actual next free port, scan `packages/*/prim.yaml` for `port:` fields.

## Accent color conventions

Assigned accent colors — prefer unused ones:

| Color | Hex | Used by |
|-------|-----|---------|
| lime-green | #8BC34A | wallet |
| amber | #FFB74D | store |
| sky-blue | #29B6F6 | faucet |
| neon-green | #00ff88 | spawn |
| acid-yellow | #C6FF00 | search |
| indigo | #6C8EFF | email |
| gold | #FFC107 | token |
| cyan | #4DD0E1 | mem |
| teal | #00ACC1 | domain |
| deep-orange | #FF3D00 | track |

For new primitives, pick a visually distinct color not in the list above. Derive `accent_dim` by darkening 20%, and `accent_glow` as `rgba(r,g,b,0.08)`.

## Operation ID conventions

`operation_id` is derived from the route path:
- `POST /v1/call` → `call`
- `POST /v1/messages/list` → `messages_list`
- `GET /v1/wallets/:address` → `get_wallet` (add semantic prefix for clarity)
- `DELETE /v1/wallets/:address` → `deactivate_wallet`

Type names are PascalCase from operation_id:
- `call` → `CallRequest`, `CallResponse`
- `messages_list` → `MessagesListRequest`, `MessagesListResponse`

## Route naming patterns

- Use `/v1/<resource>` for collections: `GET /v1/messages`, `POST /v1/messages`
- Use `/v1/<resource>/:id` for single items: `GET /v1/messages/:id`, `DELETE /v1/messages/:id`
- Use `/v1/<resource>/:id/<action>` for sub-actions: `POST /v1/messages/:id/send`
- Keep paths short and noun-based; actions go as sub-paths or in the request body

## Pricing conventions

- Simple lookup/query: `$0.01`
- Resource creation (persistent): `$0.05`–`$0.10`
- Compute-heavy operations: `$0.05`–`$1.00`
- Registration / one-time setup: `free`

## Complete example — search.sh

```yaml
id: search
name: search.sh
endpoint: search.prim.sh
status: live
type: search
description: "Search for agents. No ads, no SEO spam. Just facts and clean markdown."
port: 3005
accent: "#C6FF00"
accent_dim: "#a8d900"
accent_glow: "rgba(198,255,0,0.08)"
wraps: Tavily API
env:
  - PRIM_PAY_TO
  - PRIM_NETWORK
  - TAVILY_API_KEY
  - WALLET_INTERNAL_URL
pricing:
  - op: "Web search"
    price: "$0.01"
    note: "Per query"
  - op: "News search"
    price: "$0.01"
    note: "Per query"
  - op: "URL extract"
    price: "$0.005"
    note: "Per URL"
providers:
  - name: tavily
    env: [TAVILY_API_KEY]
    status: active
    default: true
    url: https://tavily.com/
interfaces:
  mcp: true
  cli: true
  tools: true
  rest: true
factory:
  max_body_size: "1MB"
  metrics: true
  free_service: false
routes_map:
  - route: "POST /v1/search"
    request: SearchRequest
    response: SearchResponse
    status: 200
    description: "Search the web and return ranked results with optional AI-generated answer"
    operation_id: search_web
    errors:
      - { status: 400, code: invalid_request, description: "Missing or invalid query" }
      - { status: 402, code: payment_required, description: "x402 payment needed" }
      - { status: 429, code: rate_limited, description: "Too many requests. Check Retry-After header." }
      - { status: 502, code: provider_error, description: "Upstream search provider unavailable" }
  - route: "POST /v1/search/news"
    request: SearchRequest
    response: SearchResponse
    status: 200
    description: "Search for recent news articles, ordered by recency"
    operation_id: search_news
    errors:
      - { status: 400, code: invalid_request, description: "Missing or invalid query" }
      - { status: 402, code: payment_required, description: "x402 payment needed" }
      - { status: 429, code: rate_limited, description: "Too many requests" }
      - { status: 502, code: provider_error, description: "Upstream search provider unavailable" }
  - route: "POST /v1/extract"
    request: ExtractRequest
    response: ExtractResponse
    status: 200
    description: "Extract readable content from one or more URLs as markdown or plain text"
    operation_id: extract_url
    errors:
      - { status: 400, code: invalid_request, description: "Missing urls field or invalid URL format" }
      - { status: 402, code: payment_required, description: "x402 payment needed" }
      - { status: 429, code: rate_limited, description: "Too many requests" }
      - { status: 502, code: provider_error, description: "Upstream extraction provider unavailable" }
```

## Workflow

1. Read the user's description of the new primitive
2. Identify: what it does, what upstream API/service it wraps (if any), what routes it exposes, what type it is
3. Generate the complete `prim.yaml` following the schema and conventions above
4. Write it to `packages/<id>/prim.yaml`
5. Confirm: "Run `pnpm create-prim <id>` to scaffold the package? (y/n)"
6. If yes, run: `pnpm create-prim <id>`

## Validation checklist

Before writing the file:
- [ ] `id` is unique (not in `packages/*/prim.yaml`)
- [ ] `port` is not already assigned (see port table above)
- [ ] `accent` is visually distinct from existing colors
- [ ] All `routes_map` entries have `operation_id`, `request`, `response`, `description`
- [ ] `env` includes `PRIM_PAY_TO`, `PRIM_NETWORK`, `WALLET_INTERNAL_URL`
- [ ] `pricing` entries match the routes
- [ ] `status` is `"building"` for new prims
