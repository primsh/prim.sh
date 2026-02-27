# COMM-W3: llms.txt Code Generation

## Context

Per-prim llms.txt files are hand-maintained across two locations: static files in `site/<prim>/llms.txt` and embedded `LLMS_TXT` const strings in 4 index.ts files (email, domain, token, mem). This creates drift between code and docs, inconsistency across prims, and maintenance burden.

All the data needed to generate llms.txt already exists in structured form: `prim.yaml` (metadata, pricing), `ROUTES` const in `index.ts` (route→price), TypeScript interfaces in `api.ts` (request/response shapes), and `ERROR_CODES` arrays. The only gaps are JSDoc annotations on interface fields and a few new prim.yaml fields for agent-facing content (quick start, tips, limits).

Goal: make every per-prim llms.txt fully code-generated from structured SOT. One command (`bun scripts/gen-prims.ts`) produces all files. CI validates they're up to date.

## llms.txt Content Spec

Each generated file includes these sections:

1. **Header** — name, description, base URL, auth, chain, install line (from `prim.yaml`)
2. **Quick Start** — ordered steps showing the happy path (from `prim.yaml.quick_start`)
3. **Tips** — agent-facing operational hints (from `prim.yaml.tips`)
4. **Limits** — hard constraints: rate limits, quotas, max values (from `prim.yaml.limits`)
5. **x402 Payment boilerplate** — same across all paid prims, skipped for faucet (template)
6. **Error envelope** — standard format (template)
7. **Error codes** — from `ERROR_CODES` array in `api.ts`
8. **Free endpoint docs** — GET /, GET /pricing, GET /v1/metrics (template)
9. **Per-endpoint docs** — method, path, price, description, request fields (name, type, required/optional, description from JSDoc), response fields, query params, errors (from `prim.yaml.routes_map` + parsed `api.ts`)
10. **Ownership** — resource scoping rules (from `prim.yaml.ownership`)

## Phase A: Data Annotation (PARA)

Two independent tracks that don't touch the same files.

### COM-1: JSDoc + api.ts cleanup

Add JSDoc annotations to every field in every exported interface across all 10 built prim `api.ts` files. Create `packages/faucet/src/api.ts` (faucet currently has no api.ts — types are inline). Add missing `ERROR_CODES` arrays to search and track.

**JSDoc format convention:**
```typescript
export interface CreateBucketRequest {
  /** Bucket name. Unique per wallet. 3-63 chars, alphanumeric + hyphens. */
  name: string;
  /** Storage region (e.g. "us-east-1"). Defaults to primary region. */
  location?: string;
}
```

Embed defaults and constraints in the JSDoc: `/** 1-20, default 10. */`

**Source for field descriptions**: existing hand-written `site/<prim>/llms.txt` files + validation rules in `service.ts` files.

**Files:**
- `packages/wallet/src/api.ts` — 10 interfaces, ~30 fields
- `packages/store/src/api.ts` — 7 interfaces, ~20 fields
- `packages/email/src/api.ts` — 15 interfaces, ~50 fields
- `packages/search/src/api.ts` — 6 interfaces, ~20 fields + add `ERROR_CODES`
- `packages/spawn/src/api.ts` — 10 interfaces, ~35 fields
- `packages/faucet/src/api.ts` — **NEW FILE**: DripRequest, DripResponse, FaucetStatusResponse, ERROR_CODES
- `packages/token/src/api.ts` — existing, add JSDoc
- `packages/domain/src/api.ts` — existing, add JSDoc
- `packages/mem/src/api.ts` — existing, partially has JSDoc, complete it
- `packages/track/src/api.ts` — existing, add JSDoc + `ERROR_CODES`

### COM-2: prim.yaml fields + Primitive type

Add new fields to each prim's `prim.yaml` and update the `Primitive` interface in `scripts/lib/primitives.ts`.

**New prim.yaml fields:**

```yaml
quick_start:
  - "POST /v1/wallets with EIP-191 signature → register wallet (free)"
  - "POST faucet.prim.sh/v1/faucet/usdc → get test USDC"
  - "Call any paid endpoint → 402 → sign payment → resend"

tips:
  - "Registration is free. No x402 payment needed."
  - "Timestamp in signed message must be within 5 minutes of server time."

limits:
  - "Max wallets per owner: 100"

ownership: "All resources scoped to wallet address from x402 payment."

routes_map:
  - route: "POST /v1/wallets"
    request: WalletRegisterRequest
    response: WalletRegisterResponse
    status: 201
    description: "Register a wallet via EIP-191 signature"
    notes: "Free. No x402 required."
  - route: "GET /v1/wallets"
    request: null
    response: "PaginatedList<WalletListItem>"
    status: 200
    description: "List registered wallets"
    query_params:
      - { name: limit, type: integer, description: "1-100, default 20" }
      - { name: after, type: string, description: "Cursor from previous response" }
```

The `routes_map` is the explicit route-to-type mapping. It provides: which TypeScript interface to parse for request/response fields, HTTP status code, human-readable description, query parameters (not captured in interfaces), and optional notes.

**Per-route errors**: add `errors` array to routes_map entries:
```yaml
    errors:
      - { status: 400, code: invalid_request, description: "Missing or invalid fields" }
      - { status: 402, code: payment_required, description: "x402 payment needed" }
```

**Files:**
- `scripts/lib/primitives.ts` — add RouteQueryParam, RouteError, RouteMapping, and new fields to Primitive interface
- `packages/*/prim.yaml` (10 files) — add quick_start, tips, limits, ownership, routes_map

## Phase B: Generator (SRL)

### COM-3: Build api.ts parser

Create `scripts/lib/parse-api.ts` — regex-based parser that extracts interfaces, fields, JSDoc, and ERROR_CODES from a TypeScript api.ts file.

**Output types:**
```typescript
interface ParsedField {
  name: string;
  type: string;          // "string", "number", "string | null", etc.
  optional: boolean;     // true if field has `?`
  description: string;   // from JSDoc
}

interface ParsedInterface {
  name: string;
  fields: ParsedField[];
  extends?: string;
}

interface ParsedApi {
  interfaces: Map<string, ParsedInterface>;
  errorCodes: string[];
}
```

**Parsing strategy** (regex, not ts-morph — lightweight, no new deps):
1. Split file into blocks by `export interface` / `export const ERROR_CODES`
2. For each interface: extract name, `extends` clause, then fields within `{ }`
3. For each field: extract preceding `/** ... */` JSDoc, field name, `?` marker, type annotation
4. For ERROR_CODES: extract string array from `[...] as const`

**Edge cases to handle:**
- Multi-line JSDoc (join lines, strip `*`)
- Union types: `string | null`, `"pending" | "confirmed"`
- Array types: `SearchResult[]`, `string[]`
- Nested type refs: `SpendingPolicy | null`
- `@deprecated` type aliases — skip these
- `extends` clause: `EmailDetail extends EmailMessage`

**Test**: parse all 10 api.ts files, verify output matches expected interface count and field count.

### COM-4: Build renderer + wire into gen-prims.ts

Create `scripts/lib/render-llms-txt.ts` — takes a `Primitive` (with routes_map) and `ParsedApi`, emits complete llms.txt string.

**Template structure** (matches existing hand-written format):
```
# {endpoint}

{description}
{auth + payment details}

Base URL: https://{endpoint}
Auth: {auth_line}
Chain: {chain_line}

Install:
  curl -fsSL https://{endpoint}/install.sh | sh

{limits_block if any}

---

## Quick Start
{numbered steps}

## Tips
{bullet list}

---

## x402 Payment
{boilerplate — skip for faucet}

Error envelope:
  {"error": {"code": "<code>", "message": "<msg>"}}

Error codes:
{from ERROR_CODES array}

---

## Endpoints

### GET /
{health check boilerplate}

### GET /pricing
{pricing boilerplate}

### GET /v1/metrics
{metrics boilerplate}

{for each route in routes_map:}
### {METHOD} {path}
{description}
{notes if any}
Price: {price from ROUTES const}

{path params if route has :param or [param]}
{query params if route has query_params}

Request:
  {field}  {type}  {required|optional}  {description from JSDoc}

Response ({status}):
  {field}  {type}  {description from JSDoc}

Errors:
  {status}  {code}  {description}

---

## Ownership
{ownership text}
```

**Wire into gen-prims.ts**: add new generator function and loop:
```typescript
for (const p of withRoutesMaps(prims)) {
  const parsedApi = parseApiFile(`packages/${p.id}/src/api.ts`);
  const routePrices = parseRoutePrices(`packages/${p.id}/src/index.ts`);
  const content = renderLlmsTxt(p, parsedApi, routePrices);
  applyFullFile(`site/${p.id}/llms.txt`, content);
}
```

Also need `parseRoutePrices()` — regex-extracts the ROUTES const from index.ts to get method+path→price mapping.

## Phase C: Integration (depends on Phase B)

### COM-5: Unify /llms.txt serving across all prims

**Add GET /llms.txt handler to prims that lack it** (wallet, store, spawn, search, faucet, track):
```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LLMS_TXT = readFileSync(
  resolve(import.meta.dir, "../../../site/<id>/llms.txt"), "utf-8"
);

app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});
```

**Add `"GET /llms.txt"` to freeRoutes** for all prims.

**Remove embedded LLMS_TXT const strings** from email, domain, token, mem index.ts — replace with `readFileSync` pattern above.

**VPS path**: repo at `/opt/prim`, structure mirrors local. `import.meta.dir` resolves to `packages/<id>/src/`, so `../../../site/<id>/llms.txt` resolves correctly.

### COM-6: CI validation

Add llms.txt check to `gen-prims.ts --check` mode. The existing `applyOrCheck` pattern already supports this — just extend it to cover the new full-file generation.

Verify `.github/workflows/ci.yml` already runs `bun scripts/gen-prims.ts --check`. If not, add step.

## Dependency Graph

```
COM-1 (JSDoc on api.ts) ──┐
                           ├── PARA ──→ COM-3 (parser) → COM-4 (renderer) → COM-5 (handlers) → COM-6 (CI)
COM-2 (prim.yaml fields) ─┘                    SRL ─────────────────────────────────────────────────────
```

## Before Closing

- [ ] Run `bun scripts/gen-prims.ts` and verify generated llms.txt matches existing hand-written versions for at least store and wallet (the most thorough existing docs)
- [ ] Run `pnpm -r test` — all tests pass
- [ ] Run `pnpm -r check` — lint + typecheck + test
- [ ] Run `bun scripts/gen-prims.ts --check` — CI check passes
- [ ] Verify `curl https://store.prim.sh/llms.txt` returns generated content after deploy
- [ ] Verify `curl https://wallet.prim.sh/llms.txt` returns generated content after deploy
- [ ] Spot-check generated output for all 6 deployed prims against existing hand-written docs — no missing endpoints, no missing fields
