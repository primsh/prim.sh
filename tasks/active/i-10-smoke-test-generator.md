# I-10: Smoke Test Generator

**Status:** pending
**Goal:** `pnpm gen:tests` generates conformant `smoke.test.ts` files from `prim.yaml` routes_map + `api.ts` type exports, ensuring every prim passes the 5-check contract without hand-writing boilerplate test code.
**Depends on:** I-9 (scaffolder structure, since gen:tests is used during scaffolding)
**Scope:** `scripts/gen-tests.ts` (new), `package.json`

## Problem

The 5-check smoke test contract exists as convention (documented in CLAUDE.md) but isn't enforced by tooling. Each smoke.test.ts is hand-written, leading to:
- Incomplete tests (search has only Check 1, domain only 37 lines)
- Inconsistent mock patterns (some use `vi.mock`, some use manual stubs)
- Test/route drift (routes added to index.ts without corresponding test assertions)

## Design

### Generation source

For each `packages/<id>/` with a `prim.yaml`:

1. Read `prim.yaml` → `name`, `routes_map` (with operation_id, price), `factory.free_service`
2. Read `src/api.ts` → extract exported type names (request/response interfaces)
3. Read `src/service.ts` → extract exported function names
4. Generate `test/smoke.test.ts`

### Generated test structure

**Check 1:** App export
```ts
it("exports a Hono app", () => { expect(app).toBeDefined(); });
```

**Check 2:** Health check
```ts
it("GET / returns health", async () => {
  const res = await app.request("/");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ service: "<name>", status: "ok" });
});
```

**Check 3:** Middleware spy (skipped if `free_service: true`)
```ts
it("registers x402 middleware with correct config", () => {
  expect(createAgentStackMiddleware).toHaveBeenCalledWith(
    expect.objectContaining({
      payTo: expect.any(String),
      freeRoutes: expect.arrayContaining(["GET /", "GET /llms.txt"]),
    }),
    expect.objectContaining({ "<METHOD> <PATH>": "<PRICE>" }),
  );
});
```

**Check 4:** Happy-path per route (one `it()` per routes_map entry)
```ts
it("POST /v1/search returns 200 with mocked service", async () => {
  mockServiceFn.mockResolvedValueOnce({ ok: true, data: { /* minimal valid shape */ } });
  const res = await app.request("/v1/search", { method: "POST", body: JSON.stringify({ query: "test" }), headers: { "Content-Type": "application/json" } });
  expect(res.status).toBe(200);
});
```

**Check 5:** Invalid input per route
```ts
it("POST /v1/search returns 400 on empty body", async () => {
  const res = await app.request("/v1/search", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
  expect(res.status).toBe(400);
});
```

### Mock generation

The generator produces the standard vi.mock block:
- `vi.mock("@primsh/x402-middleware")` — passthrough middleware + spy
- `vi.mock("../src/service.ts")` — mock all exported functions

### Marker-based preservation

Generated content is bounded by markers:

```ts
// BEGIN:GENERATED:SMOKE
... generated checks ...
// END:GENERATED:SMOKE
```

Manual test additions outside markers are preserved on re-generation. This allows developers to add custom domain-specific tests alongside the generated contract checks.

### Wire into `pnpm gen`

Add `gen:tests` to the unified gen pipeline. `gen:check` verifies generated smoke tests are up-to-date.

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/gen-tests.ts` | Create — smoke test generator |
| `scripts/lib/parse-api.ts` | Read — reuse existing api.ts parser for type extraction |
| `package.json` | Modify — add `gen:tests` script |

## Key Decisions

- **Generates full file on first run, marker-bounded on subsequent.** If `smoke.test.ts` doesn't exist, generate the complete file. If it exists, only regenerate the content between markers.
- **Minimal mock data.** Happy-path mocks return `{ ok: true, data: {} }` — just enough to test the handler wiring. Domain-specific assertions belong in manual tests.
- **One invalid-input pattern per route.** Sends empty `{}` body and expects 400. This catches missing validation. More nuanced validation testing is manual.
- **Does NOT generate smoke-live.test.ts.** Live tests require real API knowledge (valid payloads, expected responses). These remain manual.

## Testing Strategy

- Generate tests for track.sh (simplest, 1 route) → verify output matches existing smoke.test.ts
- Generate tests for search.sh (3 routes) → verify output covers all routes
- Run generated tests → must pass with existing service mocks

## Before Closing

- [ ] `pnpm gen:tests` generates valid smoke.test.ts for all deployed prims
- [ ] Generated tests pass `pnpm test`
- [ ] Marker preservation works (manual additions outside markers survive re-gen)
- [ ] `pnpm gen:check` includes test freshness
- [ ] Faucet correctly skips Check 3 (no x402 middleware assertion)
