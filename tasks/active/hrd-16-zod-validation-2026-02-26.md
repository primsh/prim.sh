# HRD-16: Zod Request Body Validation

**Status**: pending
**Depends**: HRD-15
**Blocks**: none

## Context

All 41 POST/PUT endpoints across 8 packages use bare `c.req.json<T>()` with no runtime validation. The JSON parse is wrapped in try/catch (HRD-4), but the parsed body is trusted without checking field presence, types, or enums. Manual `if (!field)` checks are scattered and incomplete.

Existing TypeScript interfaces in each `api.ts` define the expected shapes but provide no runtime guarantees.

## Scope

41 call sites across 8 packages:

| Package | Count | High-priority endpoints |
|---------|-------|------------------------|
| wallet | 9 | register (signature validation), policy (enum scope) |
| domain | 8 | quote, register (complex pricing) |
| email | 5 | send (headers, attachments) |
| mem | 4 | upsert (documents array with vectors) |
| spawn | 4 | create-server (enum sizing) |
| token | 3 | create-pool (Uniswap V3 params) |
| search | 3 | search query |
| store | 2 | bucket, set-quota |
| track | 1 | create-tracking |
| faucet | 2 | usdc, eth (address already viem-validated) |

## Approach

### Phase 1: Setup

Add `zod` to root `package.json` dependencies (shared across workspace).

### Phase 2: Per-package schemas

Create `packages/<name>/src/schemas.ts` in each package. Translate existing TypeScript interfaces from `api.ts` to Zod schemas. Example:

```typescript
// packages/wallet/src/schemas.ts
export const registerSchema = z.object({
  address: z.string(),
  signature: z.string(),
  timestamp: z.string(),
  chain: z.string().optional(),
  label: z.string().optional(),
});
```

Keep schemas ~3–5 lines each. Use `z.string()` for addresses (viem validates downstream), `z.enum()` for known enums (pause scope, server type).

### Phase 3: Replace call sites

In each `index.ts`, replace:
```typescript
const body = await c.req.json<RegisterRequest>();
```
with:
```typescript
const body = registerSchema.parse(await c.req.json());
```

### Phase 4: Error handling

Add a shared Zod error handler to `@primsh/x402-middleware`:

```typescript
// packages/x402-middleware/src/validation.ts
export function parseBody<T>(schema: ZodSchema<T>, raw: unknown): T
```

Catches `ZodError`, formats field-level messages, returns `invalidRequest()` with details. Each handler calls `parseBody(schema, await c.req.json())` — one line.

### Phase 5: Remove manual checks

Delete the scattered `if (!field1 || !field2)` blocks that Zod now handles. Keep domain-specific validation that Zod can't cover (e.g., `isAddress()` from viem).

## Files to Modify

| File | Change |
|------|--------|
| `package.json` (root) | Add `zod` dependency |
| `packages/x402-middleware/src/validation.ts` | New: `parseBody()` helper |
| `packages/x402-middleware/src/index.ts` | Export validation helper |
| `packages/*/src/schemas.ts` | New: Zod schemas per package (8 files) |
| `packages/*/src/index.ts` | Replace `c.req.json<T>()` → `parseBody()` (8 files) |

~18 files total. No test changes needed — smoke tests mock the service layer, so validation is transparent.

## Decision: What NOT to validate with Zod

- **Ethereum addresses**: Keep `isAddress()` / `getAddress()` from viem (checksums, normalization)
- **Authorization/ownership**: Stays in service layer
- **Business rules** (quota limits, rate limits): Stays in service/middleware layer

Zod handles: field presence, types, string formats, enums, nested object shape.

## Before Closing

- [ ] Run `pnpm -r test` (all pass)
- [ ] Grep for bare `c.req.json<` — zero remaining (all replaced with `parseBody()`)
- [ ] Verify a malformed body returns `{ error: { code: "invalid_request", message: "..." } }` with field details
- [ ] Verify each `schemas.ts` matches the TypeScript interface in the corresponding `api.ts`
- [ ] No `biome-ignore` suppressions added
