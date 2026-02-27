# I-9: Prim Scaffolder

**Status:** pending
**Goal:** `pnpm create-prim <id>` generates a complete, buildable, testable package from a prim.yaml file — reducing new prim creation from 17 manual steps to "write prim.yaml + implement service logic."
**Depends on:** I-8 (extended prim.yaml schema), I-5 (createPrimApp factory)
**Scope:** `scripts/create-prim.ts` (new), `package.json`

## Problem

Creating a new prim requires manually creating 8+ files with significant boilerplate: package.json, tsconfig.json, vitest.config.ts, install.sh, src/index.ts, src/api.ts, src/service.ts, test/smoke.test.ts, README.md. The index.ts alone is ~70 lines of middleware wiring (addressed by I-5 factory, but still needs to be written). This manual process is error-prone (inconsistent configs, missing fields, wrong port numbers) and slow.

## Design

### Usage

```bash
# Prerequisites: write prim.yaml first
mkdir packages/ring && vim packages/ring/prim.yaml

# Scaffold everything
pnpm create-prim ring

# Or scaffold from scratch with interactive creator (I-11)
pnpm create-prim --interactive
```

### What gets generated

From `packages/<id>/prim.yaml`, generate:

| File | Source data |
|------|------------|
| `package.json` | `id`, `name` → package name `@primsh/<id>`, port → dev script |
| `tsconfig.json` | Static template (extends `../../tsconfig.base.json`) |
| `vitest.config.ts` | Static template |
| `install.sh` | `id`, `name`, `endpoint` → curl install script |
| `src/index.ts` | `name`, `routes_map`, `factory` → createPrimApp() call + route handler stubs |
| `src/api.ts` | `routes_map` → skeleton interfaces with TODO markers per route's request/response types |
| `src/service.ts` | `routes_map` → skeleton functions returning `ServiceResult<T>` with TODO markers |
| `src/provider.ts` | `providers` → provider interface extending PrimProvider, if providers section exists |
| `src/<vendor>.ts` | `providers[0]` → skeleton implementation of provider interface for default vendor |
| `test/smoke.test.ts` | `name`, `routes_map` → full 5-check contract test (delegated to I-10 gen:tests) |
| `README.md` | `name`, `description`, `routes_map`, `pricing` → structured README |

### Skip existing files

If a file already exists, skip it (print "skipped: file exists"). Use `--force` flag to overwrite. This makes the scaffolder safe to re-run — it won't clobber implementation work.

### Template approach

Templates are inline in `create-prim.ts` as template literal functions, not separate template files. Rationale: templates are tightly coupled to the prim architecture — they reference specific imports, types, and patterns. Co-locating them with the generation logic makes maintenance easier. If the factory signature changes, the template updates in the same file.

### Generated index.ts structure

After factory (I-5), each generated index.ts is ~15-30 lines:

```ts
// Conceptual — actual template in create-prim.ts
import { createPrimApp } from "@primsh/x402-middleware";
import { handler1 } from "./service.ts";

const app = createPrimApp({ name: "ring.sh", routes: RING_ROUTES, ... });
app.post("/v1/call", async (c) => { /* handler stub */ });
export default app;
```

### Generated api.ts skeleton

Each route in routes_map produces a request + response interface with TODO markers:

```ts
// TODO: Define request fields for POST /v1/call
export interface MakeCallRequest {
  // Add fields here
}

// TODO: Define response fields for POST /v1/call
export interface MakeCallResponse {
  // Add fields here
}
```

### Generated service.ts skeleton

Each route produces a function stub:

```ts
export async function makeCall(body: MakeCallRequest): Promise<ServiceResult<MakeCallResponse>> {
  // TODO: Implement
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/create-prim.ts` | Create — scaffolder script with all templates |
| `package.json` | Modify — add `create-prim` script |

## Key Decisions

- **prim.yaml must exist before scaffolding.** The scaffolder reads it, not creates it. prim.yaml creation is I-11's job (interactive) or manual.
- **operation_id drives naming.** Function names, type names, and route comments all derive from `operation_id` in routes_map. `search_web` → `searchWeb()` function, `SearchWebRequest` type.
- **No database scaffolding.** Whether a prim is stateful (needs db.ts) is a design decision made during implementation, not scaffolding. The developer adds db.ts manually if needed.
- **Provider scaffolding is optional.** Only generated if prim.yaml has a `providers` section. Stateless prims or prims wrapping libraries (not services) skip this.

## Testing Strategy

- Test by scaffolding a dummy prim (e.g. `ring`), then running `pnpm check` in the generated package — should pass lint + typecheck (tests will fail since service is stub)
- Verify `--force` overwrites files, default skips existing
- Verify missing prim.yaml → clear error message

## Before Closing

- [ ] `pnpm create-prim <id>` generates all expected files
- [ ] Generated package passes `pnpm lint` and `pnpm typecheck`
- [ ] Skip behavior works (existing files not overwritten without --force)
- [ ] Generated smoke.test.ts has all 5 checks (delegates to I-10 or embeds template)
- [ ] Generated index.ts uses createPrimApp() factory
- [ ] README.md includes accurate route listing from prim.yaml
