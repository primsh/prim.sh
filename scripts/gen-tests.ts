#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-tests.ts — Smoke test generator
 *
 * Reads packages/<id>/prim.yaml (routes_map, factory) and src/service.ts (exported functions),
 * then generates a conformant smoke.test.ts with the 5-check contract.
 *
 * Usage:
 *   bun scripts/gen-tests.ts          # generate for all prims with routes_map
 *   bun scripts/gen-tests.ts track    # generate for a specific prim only
 *   bun scripts/gen-tests.ts --check  # diff against disk, exit 1 if any would change
 *
 * Generation strategy:
 *   - If smoke.test.ts does not exist: write full file
 *   - If smoke.test.ts exists:
 *       - If markers present: replace content between markers
 *       - If no markers: skip (do not overwrite manual tests without markers)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type ParsedField, type ParsedInterface, parseApiFile } from "./lib/parse-api.js";
import {
  type Primitive,
  type RouteMapping,
  loadPrimitives,
  withPackage,
} from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");
const CHECK_MODE = process.argv.includes("--check");
const TARGET_ID = process.argv.find(
  (a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1],
);

let anyFailed = false;

// ── Service export parser ────────────────────────────────────────────────────

/**
 * Extract exported function names from a service.ts file.
 * Looks for: export function, export async function, export const <fn> =
 */
function parseServiceExports(servicePath: string): string[] {
  if (!existsSync(servicePath)) return [];
  const src = readFileSync(servicePath, "utf8");
  const fns: string[] = [];

  // export function foo / export async function foo
  const fnRe = /^export\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = fnRe.exec(src)) !== null) {
    fns.push(m[1]);
  }

  // export const foo = ... (arrow functions / values)
  const constRe = /^export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/gm;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = constRe.exec(src)) !== null) {
    fns.push(m[1]);
  }

  return fns;
}

/**
 * Detect whether a service uses the { ok: true, data } / { ok: false } pattern.
 * Returns false for throw-based services like faucet.
 */
function serviceUsesOkPattern(servicePath: string): boolean {
  if (!existsSync(servicePath)) return true;
  const src = readFileSync(servicePath, "utf8");
  return src.includes("ok: true") || src.includes("ok: false");
}

// ── Route helpers ────────────────────────────────────────────────────────────

/** Parse "METHOD /path" → { method, path } */
function parseRoute(route: string): { method: string; path: string } {
  const parts = route.trim().split(/\s+/);
  return { method: parts[0], path: parts[1] };
}

/**
 * Pick the "primary" route to use for Check 4 + Check 5.
 * Prefers the first POST route; falls back to first any-method route.
 */
function primaryRoute(routes: RouteMapping[]): RouteMapping | undefined {
  return routes.find((r) => parseRoute(r.route).method === "POST") ?? routes[0];
}

/**
 * Derive a camelCase function name from operation_id.
 * "track_package" → "trackPackage"
 */
function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Given operation_id and service exports, find the best matching function name.
 */
function matchServiceFn(
  operationId: string | undefined,
  serviceExports: string[],
): string | undefined {
  if (!operationId) return undefined;
  const camel = toCamelCase(operationId);
  if (serviceExports.includes(camel)) return camel;
  const firstWord = operationId.split("_")[0];
  const match = serviceExports.find((fn) => fn.toLowerCase().startsWith(firstWord.toLowerCase()));
  return match ?? camel;
}

/**
 * Build a minimal JSON body object from a request type's required fields.
 * Returns a JS object literal string like `{ address: "0x...", name: "test" }`.
 */
function buildMinimalBody(
  requestTypeName: string | null | undefined,
  interfaces: Map<string, ParsedInterface>,
): string {
  if (!requestTypeName) return "{}";
  const iface = interfaces.get(requestTypeName);
  if (!iface || iface.fields.length === 0) return "{}";

  const requiredFields = iface.fields.filter((f) => !f.optional);
  if (requiredFields.length === 0) return "{}";

  const entries = requiredFields.map((f) => {
    const val = syntheticValue(f);
    return `${f.name}: ${val}`;
  });
  return `{ ${entries.join(", ")} }`;
}

/** Generate a synthetic value for a field based on its type and name. */
function syntheticValue(field: ParsedField): string {
  const name = field.name.toLowerCase();
  const type = field.type.toLowerCase();

  // Special field names
  if (name === "address" || name.endsWith("_address") || name.endsWith("address")) {
    return '"0x0000000000000000000000000000000000000001"';
  }
  if (name === "tracking_number") return '"1Z999AA10123456784"';
  if (name === "carrier") return '"ups"';
  if (name === "domain") return '"example.com"';
  if (name === "name") return '"test"';
  if (name === "query") return '"test query"';
  if (name === "username") return '"testuser"';
  if (name === "symbol") return '"TST"';
  if (name === "supply" || name === "initial_supply") return '"1000000"';
  if (name === "years") return "1";

  // Type-based fallbacks
  if (type === "string" || type.startsWith("string")) return '"test"';
  if (type === "number" || type === "integer") return "1";
  if (type === "boolean") return "true";
  if (type.endsWith("[]")) return "[]";

  return '"test"';
}

// ── Code generation ──────────────────────────────────────────────────────────

const MARKER_OPEN = "// BEGIN:GENERATED:SMOKE";
const MARKER_CLOSE = "// END:GENERATED:SMOKE";

/**
 * Parse exported function names from a db.ts file.
 * Used to build a db mock that stubs out sqlite-backed functions.
 */
function parseDbExports(dbPath: string): string[] {
  if (!existsSync(dbPath)) return [];
  const src = readFileSync(dbPath, "utf8");
  const fns: string[] = [];
  const fnRe = /^export\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = fnRe.exec(src)) !== null) {
    fns.push(m[1]);
  }
  return fns;
}

/**
 * Detect whether a db.ts file imports from bun:sqlite.
 */
function dbUsesBunSqlite(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false;
  const src = readFileSync(dbPath, "utf8");
  return src.includes("bun:sqlite") || src.includes('from "bun:sqlite"');
}

interface GenContext {
  p: Primitive;
  routes: RouteMapping[];
  serviceExports: string[];
  mockableServiceFns: string[];
  isFreeService: boolean;
  needsWalletAddress: boolean;
  hasServiceFile: boolean;
  hasDbFile: boolean;
  dbExports: string[];
  needsBunSqliteMock: boolean;
  serviceUsesOkWrapper: boolean;
  apiInterfaces: Map<string, ParsedInterface>;
}

function buildContext(p: Primitive): GenContext {
  const routes = p.routes_map ?? [];
  const servicePath = join(ROOT, "packages", p.id, "src/service.ts");
  const dbPath = join(ROOT, "packages", p.id, "src/db.ts");
  const apiPath = join(ROOT, "packages", p.id, "src/api.ts");
  const serviceExports = parseServiceExports(servicePath);
  const isFreeService = p.factory?.free_service === true;

  // Filter to only function-like exports (skip validators, pure helpers, type guards)
  const mockableServiceFns = serviceExports.filter(
    (fn) =>
      !fn.startsWith("is") &&
      !fn.startsWith("validate") &&
      !fn.startsWith("reset") &&
      !/^[A-Z]/.test(fn),
  );

  // Prims that scope resources to wallet need walletAddress set in mock middleware
  const needsWalletAddress = !isFreeService;

  const serviceUsesOkWrapper = serviceUsesOkPattern(servicePath);

  const hasDbFile = existsSync(dbPath);
  const dbExports = hasDbFile ? parseDbExports(dbPath) : [];
  const needsBunSqliteMock = hasDbFile && dbUsesBunSqlite(dbPath);

  // Parse api.ts for request type field info
  const apiInterfaces: Map<string, ParsedInterface> = existsSync(apiPath)
    ? parseApiFile(apiPath).interfaces
    : new Map();

  return {
    p,
    routes,
    serviceExports,
    mockableServiceFns,
    isFreeService,
    needsWalletAddress,
    hasServiceFile: existsSync(servicePath),
    hasDbFile,
    dbExports,
    needsBunSqliteMock,
    serviceUsesOkWrapper,
    apiInterfaces,
  };
}

/**
 * Generate the full smoke.test.ts file content (without markers on first generation).
 */
function generateFullFile(ctx: GenContext): string {
  const lines: string[] = [];
  const primary = primaryRoute(ctx.routes);

  // Preamble
  lines.push("// SPDX-License-Identifier: Apache-2.0");
  lines.push(`import { beforeEach, describe, expect, it, vi } from "vitest";`);
  lines.push("");

  // Env setup — vi.hoisted ensures env vars are set before ES module imports
  if (!ctx.isFreeService) {
    lines.push("vi.hoisted(() => {");
    lines.push(`  process.env.PRIM_NETWORK = "eip155:8453";`);
    lines.push(`  process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";`);
    lines.push("});");
  } else {
    lines.push("vi.hoisted(() => {");
    lines.push(`  process.env.PRIM_NETWORK = "eip155:84532"; // testnet for free service`);
    lines.push("});");
  }
  lines.push("");

  // bun:sqlite mock — needed when db.ts uses bun:sqlite (for Node/vitest compat)
  if (ctx.needsBunSqliteMock) {
    lines.push(`// Stub bun:sqlite so db.ts doesn't fail in vitest (Node runtime)`);
    lines.push(
      `import { mockBunSqlite, mockX402Middleware } from "@primsh/x402-middleware/testing";`,
    );
    lines.push(`vi.mock("bun:sqlite", () => mockBunSqlite());`);
  } else {
    lines.push(`import { mockX402Middleware } from "@primsh/x402-middleware/testing";`);
  }
  lines.push("");

  if (!ctx.isFreeService) {
    lines.push("const createAgentStackMiddlewareSpy = vi.hoisted(() => vi.fn());");
    lines.push("");
    lines.push(`vi.mock("@primsh/x402-middleware", async (importOriginal) => {`);
    lines.push(
      `  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();`,
    );
    lines.push("  const mocks = mockX402Middleware();");
    lines.push(
      "  createAgentStackMiddlewareSpy.mockImplementation(mocks.createAgentStackMiddleware);",
    );
    lines.push("  return {");
    lines.push("    ...original,");
    lines.push("    createAgentStackMiddleware: createAgentStackMiddlewareSpy,");
    lines.push(
      "    createWalletAllowlistChecker: vi.fn(mocks.createWalletAllowlistChecker),",
    );
    lines.push("  };");
    lines.push("});");
  } else {
    lines.push(`vi.mock("@primsh/x402-middleware", async (importOriginal) => {`);
    lines.push(
      `  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();`,
    );
    lines.push("  const mocks = mockX402Middleware();");
    lines.push("  return {");
    lines.push("    ...original,");
    lines.push("    createAgentStackMiddleware: vi.fn(mocks.createAgentStackMiddleware),");
    lines.push(
      "    createWalletAllowlistChecker: vi.fn(mocks.createWalletAllowlistChecker),",
    );
    lines.push("  };");
    lines.push("});");
  }
  lines.push("");

  // Service mock
  if (ctx.hasServiceFile && ctx.mockableServiceFns.length > 0) {
    lines.push(`// Mock the service so smoke tests don't need a real API key`);
    lines.push(`vi.mock("../src/service.ts", async (importOriginal) => {`);
    lines.push(`  const original = await importOriginal<typeof import("../src/service.ts")>();`);
    lines.push("  return {");
    lines.push("    ...original,");
    for (const fn of ctx.mockableServiceFns) {
      lines.push(`    ${fn}: vi.fn(),`);
    }
    lines.push("  };");
    lines.push("});");
    lines.push("");
  }

  // Imports
  lines.push(`import app from "../src/index.ts";`);

  // Primary route service function import
  let primaryServiceFn: string | undefined;
  if (primary && ctx.hasServiceFile) {
    const matched = matchServiceFn(primary.operation_id, ctx.serviceExports);
    if (matched && ctx.serviceExports.includes(matched)) {
      primaryServiceFn = matched;
      lines.push(`import { ${primaryServiceFn} } from "../src/service.ts";`);
    }
  }

  // createAgentStackMiddleware spy is defined in the preamble (no import needed)

  // Response type import from primary route — intentionally omitted from mock
  // (mocks use `as any` since smoke tests only check HTTP status, not response shape)

  lines.push("");

  // Marker open
  lines.push(MARKER_OPEN);
  lines.push(generateMarkedContent(ctx, primary, primaryServiceFn));
  lines.push(MARKER_CLOSE);
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate the content that goes between the markers (the describe block + all checks).
 */
function generateMarkedContent(
  ctx: GenContext,
  primary: RouteMapping | undefined,
  primaryServiceFn: string | undefined,
): string {
  const { p, routes, isFreeService, serviceUsesOkWrapper, apiInterfaces } = ctx;
  const lines: string[] = [];

  // Describe block open
  lines.push(`describe("${p.name} app", () => {`);

  // beforeEach to reset primary mock
  if (primaryServiceFn) {
    lines.push("  beforeEach(() => {");
    lines.push(`    vi.mocked(${primaryServiceFn}).mockReset();`);
    lines.push("  });");
    lines.push("");
  }

  // Check 1
  lines.push("  // Check 1: default export defined");
  lines.push(`  it("exposes a default export", () => {`);
  lines.push("    expect(app).toBeDefined();");
  lines.push("  });");
  lines.push("");

  // Check 2
  lines.push("  // Check 2: GET / returns health response");
  lines.push(`  it("GET / returns { service: '${p.name}', status: 'ok' }", async () => {`);
  lines.push(`    const res = await app.request("/");`);
  lines.push("    expect(res.status).toBe(200);");
  lines.push("    const body = await res.json();");
  lines.push(`    expect(body).toMatchObject({ service: "${p.name}", status: "ok" });`);
  lines.push("  });");
  lines.push("");

  // Check 3 (only for non-free services)
  if (!isFreeService) {
    const firstRoute = routes[0]?.route;

    lines.push(
      "  // Check 3: x402 middleware is wired with the correct paid routes and payTo address",
    );
    lines.push(`  it("x402 middleware is registered with paid routes and payTo", () => {`);
    lines.push("    expect(createAgentStackMiddlewareSpy).toHaveBeenCalledWith(");
    lines.push("      expect.objectContaining({");
    lines.push("        payTo: expect.any(String),");
    lines.push(`        freeRoutes: expect.arrayContaining(["GET /"]),`);
    lines.push("      }),");
    if (firstRoute) {
      lines.push(`      expect.objectContaining({ "${firstRoute}": expect.any(String) }),`);
    } else {
      lines.push("      expect.any(Object),");
    }
    lines.push("    );");
    lines.push("  });");
    lines.push("");
  }

  // Check 4: happy path on primary route
  if (primary) {
    const { method, path } = parseRoute(primary.route);
    const expectedStatus = primary.status ?? 200;
    const responseType = primary.response_type;

    // Build minimal valid body for Check 4 (not empty {} — include required fields)
    const minimalBody =
      method !== "GET" ? buildMinimalBody(primary.request_type, apiInterfaces) : null;

    lines.push(
      `  // Check 4: happy path — handler returns ${expectedStatus} with mocked service response`,
    );
    lines.push(
      `  it("${method} ${path} returns ${expectedStatus} with valid response", async () => {`,
    );

    if (primaryServiceFn) {
      if (serviceUsesOkWrapper) {
        lines.push(
          "    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code",
        );
        lines.push(
          `    vi.mocked(${primaryServiceFn}).mockResolvedValueOnce({ ok: true, data: {} as any });`,
        );
      } else {
        // Throw-based service (e.g. faucet) — resolve with minimal shape
        lines.push(
          "    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code",
        );
        lines.push(`    vi.mocked(${primaryServiceFn}).mockResolvedValueOnce({} as any);`);
      }
      lines.push("");
    }

    if (method !== "GET") {
      lines.push(`    const res = await app.request("${path}", {`);
      lines.push(`      method: "${method}",`);
      lines.push(`      headers: { "Content-Type": "application/json" },`);
      lines.push(`      body: JSON.stringify(${minimalBody}),`);
      lines.push("    });");
    } else {
      lines.push(`    const res = await app.request("${path}");`);
    }

    lines.push("");
    lines.push(`    expect(res.status).toBe(${expectedStatus});`);
    lines.push("  });");
    lines.push("");

    // Check 5: invalid input — send empty {} for POST routes (catches missing required fields)
    if (method !== "GET") {
      lines.push(
        "  // Check 5: 400 on missing/invalid input — service returns invalid_request → handler maps to 400",
      );
      lines.push(`  it("${method} ${path} with missing/invalid input returns 400", async () => {`);
      if (primaryServiceFn && serviceUsesOkWrapper) {
        lines.push(`    vi.mocked(${primaryServiceFn}).mockResolvedValueOnce({`);
        lines.push("      ok: false,");
        lines.push("      status: 400,");
        lines.push(`      code: "invalid_request",`);
        lines.push(`      message: "Missing required fields",`);
        lines.push("    });");
        lines.push("");
      }
      lines.push(`    const res = await app.request("${path}", {`);
      lines.push(`      method: "${method}",`);
      lines.push(`      headers: { "Content-Type": "application/json" },`);
      lines.push(`      body: "{}",`);
      lines.push("    });");
      lines.push("    expect(res.status).toBe(400);");
      lines.push("  });");
    } else {
      // GET route — check 5 sends missing required query params
      lines.push("  // Check 5: 400 on missing required query param");
      lines.push(`  it("${method} ${path} with missing params returns 400", async () => {`);
      lines.push(`    const res = await app.request("${path}");`);
      lines.push("    expect(res.status).toBe(400);");
      lines.push("  });");
    }
  }

  lines.push("});");

  return lines.join("\n");
}

// ── Marker injection ─────────────────────────────────────────────────────────

/**
 * If smoke.test.ts exists with markers, replace the generated section.
 */
function injectIntoExisting(
  existing: string,
  newContent: string,
): { result: string; hadMarkers: boolean; changed: boolean } {
  const openIdx = existing.indexOf(MARKER_OPEN);
  const closeIdx = existing.indexOf(MARKER_CLOSE);

  if (openIdx === -1 || closeIdx === -1) {
    return { result: existing, hadMarkers: false, changed: false };
  }

  const before = existing.slice(0, openIdx + MARKER_OPEN.length);
  const after = existing.slice(closeIdx);
  const result = `${before}\n${newContent}\n${after}`;
  const changed = result !== existing;
  return { result, hadMarkers: true, changed };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const prims = loadPrimitives();
const withPkg = withPackage(prims, ROOT);

// Filter to prims with routes_map
const targets = withPkg
  .filter((p) => p.routes_map && p.routes_map.length > 0)
  .filter((p) => !TARGET_ID || p.id === TARGET_ID);

if (TARGET_ID && targets.length === 0) {
  console.error(`No prim found with id: ${TARGET_ID}`);
  process.exit(1);
}

console.log(`Loaded ${targets.length} prim(s) to process`);
console.log(CHECK_MODE ? "Mode: check\n" : "Mode: generate\n");

for (const p of targets) {
  const smokeTestPath = join(ROOT, "packages", p.id, "test/smoke.test.ts");
  const ctx = buildContext(p);
  const primary = primaryRoute(ctx.routes);

  // Resolve primary service fn
  let resolvedServiceFn: string | undefined;
  if (primary && ctx.hasServiceFile) {
    const matched = matchServiceFn(primary.operation_id, ctx.serviceExports);
    if (matched && ctx.serviceExports.includes(matched)) {
      resolvedServiceFn = matched;
    }
  }

  if (!existsSync(smokeTestPath)) {
    const content = generateFullFile(ctx);

    if (CHECK_MODE) {
      console.error(`  ✗ ${smokeTestPath} does not exist — run pnpm gen:tests`);
      anyFailed = true;
    } else {
      writeFileSync(smokeTestPath, content);
      console.log(`  ↺ ${smokeTestPath} [created]`);
    }
    continue;
  }

  // File exists — try marker injection
  const existing = readFileSync(smokeTestPath, "utf8");
  const newMarkerContent = generateMarkedContent(ctx, primary, resolvedServiceFn);
  const { result, hadMarkers, changed } = injectIntoExisting(existing, newMarkerContent);

  if (!hadMarkers) {
    if (CHECK_MODE) {
      console.log(`  – ${smokeTestPath} (no markers, skipping check)`);
    } else {
      console.log(`  – ${smokeTestPath} (no markers, skipping)`);
    }
    continue;
  }

  if (CHECK_MODE) {
    if (changed) {
      console.error(`  ✗ ${smokeTestPath} is out of date — run pnpm gen:tests`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${smokeTestPath}`);
    }
  } else {
    if (changed) {
      writeFileSync(smokeTestPath, result);
      console.log(`  ↺ ${smokeTestPath} [updated]`);
    } else {
      console.log(`  ✓ ${smokeTestPath} (up to date)`);
    }
  }
}

if (CHECK_MODE && anyFailed) {
  console.error("\nSome smoke tests are out of date. Run: pnpm gen:tests");
  process.exit(1);
} else if (CHECK_MODE) {
  console.log("\nAll smoke tests are up to date.");
} else {
  console.log("\nDone.");
}
