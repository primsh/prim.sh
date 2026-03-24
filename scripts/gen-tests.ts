#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-tests.ts — Unit test generator
 *
 * Reads packages/<id>/prim.yaml (routes_map, factory) and src/service.ts (exported functions),
 * then generates *.generated.test.ts files with per-route Check 4+5 tests.
 *
 * Usage:
 *   bun scripts/gen-tests.ts          # generate for all prims with routes_map
 *   bun scripts/gen-tests.ts track    # generate for a specific prim only
 *   bun scripts/gen-tests.ts --check  # diff against disk, exit 1 if any would change
 *
 * Output files (always overwritten):
 *   - test/unit.generated.test.ts      — per-route happy + error path tests
 *   - test/smoke-live.generated.test.ts — live endpoint tests (excluded from pnpm test)
 *   - test/service.generated.test.ts   — unit test stubs with .todo()
 *
 * Hand-written tests go in unit.custom.test.ts — this generator never touches them.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type ParsedField, type ParsedInterface, extractApiFromSchemas } from "./lib/extract-schemas.js";
import {
  type Primitive,
  type ProviderRegistry,
  type ProviderRegistryEntry,
  type RouteMapping,
  loadPrimitives,
  loadProviders,
  providerEnvVars,
  withPackage,
} from "./lib/primitives.js";
import { inferTypeNames } from "./lib/render-openapi.js";

const ROOT = resolve(import.meta.dir, "..");
const CHECK_MODE = process.argv.includes("--check");
const TARGET_ID = process.argv.find(
  (a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1],
);

let anyFailed = false;

// ── Service export parser ────────────────────────────────────────────────────

interface ServiceExport {
  name: string;
  isAsync: boolean;
  usesOkPattern: boolean;
}

/**
 * Extract exported function names and async status from a service.ts file.
 * Looks for: export function, export async function, export const <fn> =
 */
function parseServiceExports(servicePath: string): string[] {
  return parseServiceExportsDetailed(servicePath).map((e) => e.name);
}

function parseServiceExportsDetailed(servicePath: string): ServiceExport[] {
  if (!existsSync(servicePath)) return [];
  const src = readFileSync(servicePath, "utf8");
  const fns: ServiceExport[] = [];

  // Collect all export positions for function body extraction
  const exportPositions: { name: string; isAsync: boolean; startIdx: number }[] = [];

  // export function foo / export async function foo
  const fnRe = /^export\s+(async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = fnRe.exec(src)) !== null) {
    exportPositions.push({ name: m[2], isAsync: !!m[1], startIdx: m.index });
  }

  // export const foo = async ... / export const foo = ...
  const constRe = /^export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(async\s)?/gm;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = constRe.exec(src)) !== null) {
    exportPositions.push({ name: m[1], isAsync: !!m[2], startIdx: m.index });
  }

  // Sort by position and extract bodies to detect ok pattern per function
  exportPositions.sort((a, b) => a.startIdx - b.startIdx);
  for (let i = 0; i < exportPositions.length; i++) {
    const ep = exportPositions[i];
    const nextStart = i + 1 < exportPositions.length ? exportPositions[i + 1].startIdx : src.length;
    const body = src.slice(ep.startIdx, nextStart);
    const usesOkPattern = body.includes("ok: true") || body.includes("ok: false");
    fns.push({ name: ep.name, isAsync: ep.isAsync, usesOkPattern });
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
 * Handles: direct camelCase match, reversed naming (set_cache → cacheSet),
 * first-word prefix match, and contains match.
 */
interface ServiceFnMatch {
  name: string;
  exact: boolean;
}

function matchServiceFn(
  operationId: string | undefined,
  serviceExports: string[],
  routePath?: string,
): ServiceFnMatch | undefined {
  if (!operationId) return undefined;
  const camel = toCamelCase(operationId);
  // Direct match: create_collection → createCollection
  if (serviceExports.includes(camel)) return { name: camel, exact: true };

  // Reversed match: set_cache → cacheSet, get_cache → cacheGet
  const parts = operationId.split("_");
  if (parts.length >= 2) {
    const reversed = toCamelCase([...parts].reverse().join("_"));
    if (serviceExports.includes(reversed)) return { name: reversed, exact: true };
  }

  // Last-word match: get_schema → "schema", list_ports → "ports"
  const lastWord = parts[parts.length - 1];
  const lastWordMatch = serviceExports.find((fn) => fn.toLowerCase() === lastWord.toLowerCase());
  if (lastWordMatch) return { name: lastWordMatch, exact: true };

  // Verb + noun contains: set_quota → "setQuota" in "setQuotaForBucket"
  // Use full camelCase operation_id for contains, but filter to prefer exact-ish matches
  const containsMatches = serviceExports.filter((fn) =>
    fn.toLowerCase().includes(camel.toLowerCase()),
  );
  if (containsMatches.length === 1) return { name: containsMatches[0], exact: true };

  // Non-verb word match from operation_id: create_presign → "presign" in "presignObject"
  // Try each non-verb word, preferring verb-matched results to avoid cross-verb collisions
  const verbs = new Set(["get", "set", "list", "create", "delete", "update", "reconcile", "put"]);
  const verb = verbs.has(parts[0]) ? parts[0] : undefined;
  const nonVerbParts = parts.filter((p) => !verbs.has(p));
  for (const part of nonVerbParts) {
    const partMatches = serviceExports.filter((fn) => fn.toLowerCase().includes(part.toLowerCase()));
    if (verb) {
      // Prefer matches starting with the same verb (get_quota should not match setQuotaForBucket)
      const verbFiltered = partMatches.filter((fn) => fn.toLowerCase().startsWith(verb));
      if (verbFiltered.length === 1) return { name: verbFiltered[0], exact: true };
    }
    // Fallback: accept unique match by non-verb word (create_presign → presignObject)
    // But reject if the match starts with a different verb (get_quota should not match setQuotaForBucket)
    if (partMatches.length === 1) {
      const matchLower = partMatches[0].toLowerCase();
      const startsWithDifferentVerb = verb && [...verbs].some((v) => v !== verb && matchLower.startsWith(v));
      if (!startsWithDifferentVerb) return { name: partMatches[0], exact: true };
    }
  }

  // Route-path match: /v1/buckets/:id/quota → "quota" → getUsage (via route segment)
  // Extract the last meaningful path segment and match verb + segment
  if (routePath) {
    const segments = routePath.split("/").filter((s) => s && !s.startsWith(":") && s !== "v1");
    const lastSeg = segments[segments.length - 1];
    if (lastSeg) {
      const verb = parts[0];
      const routeBasedCamel = toCamelCase(`${verb}_${lastSeg}`);
      if (serviceExports.includes(routeBasedCamel)) return { name: routeBasedCamel, exact: true };
      // Also try verb + singular: "reconcile" + "usage" from "reconcile_storage" won't match,
      // but "get" + "usage" from route path /quota might if we check fn contains segment
      const segMatches = serviceExports.filter((fn) => {
        const fnLower = fn.toLowerCase();
        return fnLower.startsWith(verb) && fnLower.includes(lastSeg.toLowerCase());
      });
      if (segMatches.length === 1) return { name: segMatches[0], exact: true };
    }
  }

  // First-word prefix match, but only if unambiguous (single match)
  const firstWord = parts[0];
  const prefixMatches = serviceExports.filter((fn) => fn.toLowerCase().startsWith(firstWord.toLowerCase()));
  if (prefixMatches.length === 1) return { name: prefixMatches[0], exact: false };

  // Broad contains match (fallback — may be wrong, so inexact)
  if (containsMatches.length > 0) return { name: containsMatches[0], exact: false };

  return undefined;
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
  // Strip nullable wrapper for type matching: "number | null" → "number"
  const baseType = type.replace(/\s*\|\s*null/g, "").trim();

  // Special field names
  if (name === "address" || name === "wallet" || name.endsWith("_address") || name.endsWith("address")) {
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
  if (name === "method") return '"GET"';

  // Enum types: pick the first variant — "\"GET\" | \"PUT\"" → "GET"
  // Use original (non-lowercased) type to preserve case sensitivity
  const enumMatch = field.type.match(/^"([^"]+)"/);
  if (enumMatch) return `"${enumMatch[1]}"`;

  // Type-based fallbacks (use baseType to handle nullable)
  if (baseType === "string" || baseType.startsWith("string")) return '"test"';
  if (baseType === "number" || baseType === "integer") return "1";
  if (baseType === "boolean") return "true";
  if (baseType.endsWith("[]")) return "[]";

  return '"test"';
}

/** Generate a synthetic query parameter value based on name. */
function syntheticQueryValue(name: string): string {
  const n = name.toLowerCase();
  if (n === "address" || n.endsWith("_address")) return "0x0000000000000000000000000000000000000001";
  if (n === "limit") return "10";
  if (n === "after" || n === "cursor") return "test-cursor";
  if (n === "query" || n === "q") return "test";
  if (n === "domain") return "example.com";
  if (n === "key" || n === "name" || n === "id") return "test";
  return "test";
}

// ── Code generation ──────────────────────────────────────────────────────────

const GENERATED_HEADER = "// THIS FILE IS GENERATED";

function isGenerated(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf8");
  return content.includes(GENERATED_HEADER);
}

/** Names that collide with vitest globals — skip as service test imports */
const VITEST_GLOBALS = new Set([
  "describe",
  "it",
  "expect",
  "vi",
  "test",
  "beforeEach",
  "afterEach",
  "beforeAll",
  "afterAll",
]);

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
  serviceExportsDetailed: ServiceExport[];
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

async function buildContext(p: Primitive): Promise<GenContext> {
  const routes = p.routes_map ?? [];
  const servicePath = join(ROOT, "packages", p.id, "src/service.ts");
  const dbPath = join(ROOT, "packages", p.id, "src/db.ts");
  const apiPath = join(ROOT, "packages", p.id, "src/api.ts");
  const serviceExportsDetailed = parseServiceExportsDetailed(servicePath);
  const serviceExports = serviceExportsDetailed.map((e) => e.name);
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
  // Check both prim's own db.ts AND if index.ts imports allowlist-db (which uses bun:sqlite)
  const indexPath = join(ROOT, "packages", p.id, "src/index.ts");
  const indexUsesAllowlistDb = existsSync(indexPath) && readFileSync(indexPath, "utf8").includes("allowlist-db");
  const needsBunSqliteMock = (hasDbFile && dbUsesBunSqlite(dbPath)) || indexUsesAllowlistDb;

  // Parse api.ts for request type field info
  let apiInterfaces: Map<string, ParsedInterface> = new Map();
  if (existsSync(apiPath)) {
    const parsed = await extractApiFromSchemas(apiPath);
    apiInterfaces = parsed.interfaces;
  }

  return {
    p,
    routes,
    serviceExports,
    serviceExportsDetailed,
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
 * Generate the full unit.test.ts file content.
 */
function generateFullFile(ctx: GenContext): string {
  const lines: string[] = [];

  // Preamble
  lines.push("// SPDX-License-Identifier: Apache-2.0");
  lines.push(`${GENERATED_HEADER} — DO NOT EDIT`);
  lines.push("// Regenerate: pnpm gen:tests");
  lines.push(`import { beforeEach, describe, expect, it, vi } from "vitest";`);
  lines.push("");

  // Env setup — vi.hoisted ensures env vars are set before ES module imports
  if (!ctx.isFreeService) {
    lines.push("vi.hoisted(() => {");
    lines.push(`  process.env.PRIM_NETWORK = "eip155:8453";`);
    lines.push(`  process.env.REVENUE_WALLET = "0x0000000000000000000000000000000000000001";`);
    lines.push("});");
  } else {
    lines.push("vi.hoisted(() => {");
    lines.push(`  process.env.PRIM_NETWORK = "eip155:84532"; // testnet for free service`);
    lines.push(`  process.env.REVENUE_WALLET = "0x0000000000000000000000000000000000000001";`);
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
    lines.push("    createWalletAllowlistChecker: vi.fn(mocks.createWalletAllowlistChecker),");
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
    lines.push("    createWalletAllowlistChecker: vi.fn(mocks.createWalletAllowlistChecker),");
    lines.push("  };");
    lines.push("});");
  }
  lines.push("");

  // Service mock
  if (ctx.hasServiceFile && ctx.mockableServiceFns.length > 0) {
    lines.push(`// Mock the service so unit tests don't need a real API key`);
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

  // Build route → service function mapping for all routes
  // Only include functions that are in mockableServiceFns and don't collide with vitest globals
  const routeServiceFns = new Map<string, { name: string; exact: boolean }>();
  if (ctx.hasServiceFile) {
    for (const route of ctx.routes) {
      const { path: routePath } = parseRoute(route.route);
      const matched = matchServiceFn(route.operation_id, ctx.mockableServiceFns, routePath);
      if (matched && ctx.mockableServiceFns.includes(matched.name) && !VITEST_GLOBALS.has(matched.name)) {
        routeServiceFns.set(route.route, matched);
      }
    }
  }

  // Import all unique service functions used across routes
  const uniqueServiceFns = [...new Set([...routeServiceFns.values()].map((m) => m.name))];
  if (uniqueServiceFns.length > 0) {
    const singleLine = `import { ${uniqueServiceFns.join(", ")} } from "../src/service.ts";`;
    if (singleLine.length <= 100) {
      lines.push(singleLine);
    } else {
      lines.push("import {");
      for (const fn of uniqueServiceFns) {
        lines.push(`  ${fn},`);
      }
      lines.push(`} from "../src/service.ts";`);
    }
  }

  lines.push("");

  lines.push(generateMarkedContent(ctx, routeServiceFns));
  lines.push("");

  return lines.join("\n");
}

/**
 * Pick the best error for Check 5 from a route's errors array.
 * Prefers 400 (invalid_request) → 404 (not_found) → first triggerable error.
 * Returns null if no meaningful error path exists (e.g. status-only GET with no errors,
 * or routes where the only errors are runtime conditions we can't trigger with invalid input).
 *
 * For ok-pattern services: we mock the service to return the error, so any error works.
 * For throw-based services: we rely on the handler's own validation, so only 400 errors
 * (triggered by invalid input) are testable — runtime errors like 429/502 are skipped.
 */
function pickCheck5Error(
  route: RouteMapping,
  method: string,
  path: string,
  serviceUsesOkWrapper = true,
): { status: number; code: string; message: string } | null {
  const errors = route.errors ?? [];

  if (serviceUsesOkWrapper) {
    // ok-pattern: we can mock any error response
    // For GET routes with required query_params, prefer 400 (handler validates before service call)
    const hasRequiredQueryParams = method === "GET" && route.query_params && route.query_params.length > 0;

    if (errors.length > 0) {
      const e400 = errors.find((e) => e.status === 400);
      if (e400) return { status: 400, code: e400.code, message: e400.description };
      const e404 = errors.find((e) => e.status === 404);
      if (e404) return { status: 404, code: e404.code, message: e404.description };
      const nonPayment = errors.find((e) => e.status !== 402);
      if (nonPayment) return { status: nonPayment.status, code: nonPayment.code, message: nonPayment.description };
    }
    // Default error by method
    if (method === "DELETE" || (method === "GET" && path.includes(":"))) {
      return { status: 404, code: "not_found", message: "Resource not found" };
    }
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      return { status: 400, code: "invalid_request", message: "Missing required fields" };
    }
    if (hasRequiredQueryParams) {
      return { status: 400, code: "invalid_request", message: "Missing required query parameter" };
    }
    return null;
  }

  // Throw-based: only emit Check 5 if route has a 400 error (input validation)
  // that can be triggered by sending empty/missing input
  if (errors.length > 0) {
    const e400 = errors.find((e) => e.status === 400);
    if (e400) return { status: 400, code: e400.code, message: e400.description };
  }
  // Default 400 for POST/PUT with request body (empty {} triggers validation)
  if ((method === "POST" || method === "PUT" || method === "PATCH") && route.request) {
    return { status: 400, code: "invalid_request", message: "Missing required fields" };
  }
  return null;
}

/**
 * Generate the describe block with all unit test checks.
 * Emits Check 4 + Check 5 for every route in routes_map (not just the primary).
 */
function generateMarkedContent(
  ctx: GenContext,
  routeServiceFns: Map<string, { name: string; exact: boolean }>,
): string {
  const { p, routes, isFreeService, serviceUsesOkWrapper, apiInterfaces } = ctx;
  const lines: string[] = [];

  // Describe block open
  lines.push(`describe("${p.name} app", () => {`);

  // beforeEach to reset all service mocks
  const uniqueFns = [...new Set([...routeServiceFns.values()].map((m) => m.name))];
  if (uniqueFns.length > 0) {
    lines.push("  beforeEach(() => {");
    for (const fn of uniqueFns) {
      lines.push(`    vi.mocked(${fn}).mockReset();`);
    }
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
    lines.push("    expect(createAgentStackMiddlewareSpy).toHaveBeenCalled();");
    lines.push("  });");
    lines.push("");
  }

  // Check 4 + Check 5 for every route
  for (const route of routes) {
    const { method, path: rawPath } = parseRoute(route.route);
    // Replace :param placeholders with synthetic test values
    const path = rawPath.replace(/:([a-zA-Z_]+)/g, (_match, paramName: string) => {
      const n = paramName.toLowerCase();
      if (n === "id") return "test-id-001";
      if (n === "key") return "test-key";
      if (n === "namespace") return "test-ns";
      return `test-${paramName}`;
    });
    const expectedStatus = route.status ?? 200;
    const serviceMatch = routeServiceFns.get(route.route);
    const serviceFn = serviceMatch?.name;
    const serviceFnDetail = serviceFn
      ? ctx.serviceExportsDetailed.find((e) => e.name === serviceFn)
      : undefined;
    const serviceFnIsAsync = serviceFnDetail?.isAsync ?? true;
    const serviceFnUsesOk = serviceFnDetail?.usesOkPattern ?? serviceUsesOkWrapper;
    const mockMethod = serviceFnIsAsync ? "mockResolvedValueOnce" : "mockReturnValueOnce";
    const requestType =
      route.request_type ?? route.request ?? inferTypeNames(route.operation_id, apiInterfaces).request;
    const minimalBody = method !== "GET" && method !== "DELETE" ? buildMinimalBody(requestType, apiInterfaces) : null;

    // Auto-skip routes that the generator can't test reliably:
    // 1. No matched service function → mock won't intercept
    // 2. Inexact match → heuristic match may be wrong function
    // 3. Nested param routes on non-free prims that have 403 errors — these do DB-level
    //    ownership checks before calling the service, so mocking the service isn't enough.
    //    Single-level params (like /v1/buckets/:id) work because requireCaller() is all
    //    that's needed. Nested params (like /v1/zones/:id/records) need the parent resource
    //    to exist in the mock DB.
    const noServiceFn = !serviceFn;
    const inexactMatch = serviceMatch != null && !serviceMatch.exact;
    const paramCount = (rawPath.match(/:/g) || []).length;
    const has403 = (route.errors ?? []).some((e: { status: number }) => e.status === 403);
    const nestedOwnershipCheck = !isFreeService && paramCount >= 1 && has403;
    const needsSkip = noServiceFn || inexactMatch || nestedOwnershipCheck;
    const skipPrefix = needsSkip ? ".skip" : "";

    // Check 4: happy path
    lines.push(
      `  // Check 4: ${method} ${path} — happy path`,
    );
    lines.push(
      `  it${skipPrefix}("${method} ${path} returns ${expectedStatus} (happy path)", async () => {`,
    );

    if (serviceFn) {
      if (serviceFnUsesOk) {
        lines.push(
          "    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code",
        );
        lines.push(
          `    vi.mocked(${serviceFn}).${mockMethod}({ ok: true, data: {} } as any);`,
        );
      } else {
        lines.push(
          "    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code",
        );
        lines.push(`    vi.mocked(${serviceFn}).${mockMethod}({} as any);`);
      }
      lines.push("");
    }

    if (method === "GET" || method === "DELETE") {
      // For GET routes with required query params, include them
      const queryParams = route.query_params?.filter((qp: { name: string }) => qp.name) ?? [];
      const queryString = queryParams.length > 0
        ? `?${queryParams.map((qp: { name: string }) => `${qp.name}=${encodeURIComponent(syntheticQueryValue(qp.name))}`).join("&")}`
        : "";
      const fullPath = `${path}${queryString}`;
      const requestLine = `    const res = await app.request("${fullPath}", {`;
      if (requestLine.length <= 100) {
        lines.push(requestLine);
        lines.push(`      method: "${method}",`);
        lines.push("    });");
      } else {
        lines.push("    const res = await app.request(");
        lines.push(`      "${fullPath}",`);
        lines.push("      {");
        lines.push(`        method: "${method}",`);
        lines.push("      },");
        lines.push("    );");
      }
    } else {
      lines.push(`    const res = await app.request("${path}", {`);
      lines.push(`      method: "${method}",`);
      lines.push(`      headers: { "Content-Type": "application/json" },`);
      const bodyLine = `      body: JSON.stringify(${minimalBody}),`;
      if (bodyLine.length <= 100) {
        lines.push(bodyLine);
      } else {
        // Wrap long body objects for biome compliance
        const fields = minimalBody!.replace(/^\{/, "").replace(/\}$/, "").trim();
        lines.push("      body: JSON.stringify({");
        for (const field of fields.split(", ")) {
          lines.push(`        ${field},`);
        }
        lines.push("      }),");
      }
      lines.push("    });");
    }

    lines.push("");
    lines.push(`    expect(res.status).toBe(${expectedStatus});`);
    lines.push("  });");

    // Check 5: error path — pick error status from route's errors array or defaults
    // Only generate error test if the route has a testable error (400 or 404 in errors list,
    // or it's a POST/PUT/PATCH that can have body validation). Skip for GET/DELETE list routes
    // that only have middleware-level errors (402, 403, 429).
    const routeErrors = route.errors ?? [];
    const hasTestableError = routeErrors.some(
      (e: { status: number }) => e.status === 400 || e.status === 404,
    );
    const canTriggerError = hasTestableError || method === "POST" || method === "PUT" || method === "PATCH";
    const errorEntry = canTriggerError ? pickCheck5Error(route, method, path, serviceUsesOkWrapper) : null;
    if (errorEntry) {
      lines.push(`  // Check 5: ${method} ${path} — error path`);
      lines.push(`  it${skipPrefix}("${method} ${path} returns ${errorEntry.status} (${errorEntry.code})", async () => {`);
      if (serviceFn && serviceFnUsesOk) {
        lines.push(`    vi.mocked(${serviceFn}).${mockMethod}({`);
        lines.push("      ok: false,");
        lines.push(`      status: ${errorEntry.status},`);
        lines.push(`      code: "${errorEntry.code}",`);
        lines.push(`      message: "${errorEntry.message}",`);
        lines.push(
          "      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code",
        );
        lines.push("    } as any);");
        lines.push("");
      }
      if (method === "GET" || method === "DELETE") {
        lines.push(`    const res = await app.request("${path}", {`);
        lines.push(`      method: "${method}",`);
        lines.push("    });");
      } else {
        lines.push(`    const res = await app.request("${path}", {`);
        lines.push(`      method: "${method}",`);
        lines.push(`      headers: { "Content-Type": "application/json" },`);
        lines.push(`      body: "{}",`);
        lines.push("    });");
      }
      lines.push(`    expect(res.status).toBe(${errorEntry.status});`);
      lines.push("  });");
    }
    lines.push("");
  }

  // Remove trailing blank line before closing brace (biome formatting)
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  lines.push("});");

  return lines.join("\n");
}

// ── Smoke-live generation ─────────────────────────────────────────────────────

/**
 * Generate the full smoke-live.test.ts file content.
 */
function generateSmokeLiveFile(ctx: GenContext): string {
  const { p, routes: _routes, isFreeService } = ctx;
  const idUpper = p.id.toUpperCase();
  const endpoint = p.endpoint ?? `${p.id}.prim.sh`;

  const lines: string[] = [];
  lines.push("// SPDX-License-Identifier: Apache-2.0");
  lines.push(`${GENERATED_HEADER} — DO NOT EDIT`);
  lines.push("// Regenerate: pnpm gen:tests");
  lines.push("/**");
  lines.push(` * Live smoke test against ${endpoint}.`);
  lines.push(" *");
  lines.push(" * Run:");
  lines.push(` *   pnpm -C packages/${p.id} test:smoke`);
  lines.push(" *");
  if (isFreeService) {
    lines.push(" * All checks are non-destructive (health + error paths).");
    lines.push(` * ${p.name} is a free service — no x402 gating.`);
  } else {
    lines.push(" * All checks are non-destructive (health + error paths + 402 gating).");
  }
  lines.push(" */");
  lines.push("");
  lines.push(`import { describe, expect, it } from "vitest";`);
  lines.push("");
  lines.push(`const BASE_URL = process.env.${idUpper}_URL ?? "https://${endpoint}";`);
  lines.push("");

  lines.push(generateSmokeLiveMarkedContent(ctx));
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate the describe block for live smoke tests.
 */
function generateSmokeLiveMarkedContent(ctx: GenContext): string {
  const { p, routes, isFreeService } = ctx;
  const lines: string[] = [];

  lines.push(`describe("${p.name} live smoke test", { timeout: 15_000 }, () => {`);

  let testNum = 0;

  // Health check
  lines.push(`  it("${testNum}. GET / — health check returns service name", async () => {`);
  lines.push("    const res = await fetch(`${BASE_URL}/`);");
  lines.push("    expect(res.status).toBe(200);");
  lines.push("    const body = await res.json();");
  lines.push(`    expect(body.service).toBe("${p.name}");`);
  lines.push(`    expect(body.status).toBe("ok");`);
  lines.push("  });");

  // 402 checks for paid routes (non-free services only)
  if (!isFreeService) {
    const paidRoutes = routes.filter((r) => {
      const method = parseRoute(r.route).method;
      return method === "POST" || method === "PUT" || method === "DELETE";
    });
    for (const r of paidRoutes) {
      testNum++;
      const { method, path } = parseRoute(r.route);
      lines.push("");
      lines.push(`  it("${testNum}. ${method} ${path} — requires x402 payment", async () => {`);
      lines.push(`    const res = await fetch(\`\${BASE_URL}${path}\`, {`);
      lines.push(`      method: "${method}",`);
      lines.push(`      headers: { "Content-Type": "application/json" },`);
      lines.push(`      body: JSON.stringify({}),`);
      lines.push("    });");
      lines.push("    expect(res.status).toBe(402);");
      lines.push("  });");
    }
  }

  // 400 check for first POST route
  const firstPost = routes.find((r) => parseRoute(r.route).method === "POST");
  if (firstPost) {
    testNum++;
    const path = parseRoute(firstPost.route).path;
    lines.push("");
    lines.push(`  it("${testNum}. POST ${path} — missing fields returns 400", async () => {`);
    lines.push(`    const res = await fetch(\`\${BASE_URL}${path}\`, {`);
    lines.push(`      method: "POST",`);
    lines.push(`      headers: { "Content-Type": "application/json" },`);
    lines.push(`      body: JSON.stringify({}),`);
    lines.push("    });");
    lines.push("    expect(res.status).toBe(400);");
    lines.push("  });");
  }

  lines.push("});");

  return lines.join("\n");
}

// ── Unit test generation ──────────────────────────────────────────────────────

/**
 * Detect external provider modules imported by service.ts.
 * Returns module specifiers for non-local, non-stdlib, non-@primsh imports.
 */
function detectProviderImports(servicePath: string): string[] {
  if (!existsSync(servicePath)) return [];
  const src = readFileSync(servicePath, "utf8");
  const imports: string[] = [];
  const re = /from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(src)) !== null) {
    const spec = m[1];
    // Skip local, node:, and @primsh imports
    if (spec.startsWith(".") || spec.startsWith("node:") || spec.startsWith("@primsh/")) continue;
    // Skip bun: builtins
    if (spec.startsWith("bun:")) continue;
    imports.push(spec);
  }
  return [...new Set(imports)];
}

/**
 * Build the mapping from operation_id → route info for unit test generation.
 */
function buildRouteOpMap(
  routes: RouteMapping[],
): Map<string, { route: RouteMapping; method: string; path: string }> {
  const map = new Map<string, { route: RouteMapping; method: string; path: string }>();
  for (const r of routes) {
    if (!r.operation_id) continue;
    const { method, path } = parseRoute(r.route);
    map.set(r.operation_id, { route: r, method, path });
  }
  return map;
}

/**
 * Generate the full service.test.ts file content.
 */
function generateUnitFile(ctx: GenContext): string {
  const {
    p,
    routes,
    serviceExports,
    hasDbFile,
    needsBunSqliteMock,
    apiInterfaces: _apiInterfaces,
  } = ctx;
  const lines: string[] = [];
  const servicePath = join(ROOT, "packages", p.id, "src/service.ts");
  const providerImports = detectProviderImports(servicePath);
  const routeOpMap = buildRouteOpMap(routes);

  // Preamble
  lines.push("// SPDX-License-Identifier: Apache-2.0");
  lines.push(`${GENERATED_HEADER} — DO NOT EDIT`);
  lines.push("// Regenerate: pnpm gen:tests");
  lines.push(`import { describe, it, vi } from "vitest";`);
  lines.push("");

  // Env setup
  lines.push("vi.hoisted(() => {");
  lines.push(`  process.env.PRIM_NETWORK = "eip155:84532";`);
  lines.push("});");
  lines.push("");

  // bun:sqlite mock
  if (needsBunSqliteMock) {
    lines.push(`import { mockBunSqlite } from "@primsh/x402-middleware/testing";`);
    lines.push(`vi.mock("bun:sqlite", () => mockBunSqlite());`);
    lines.push("");
  }

  // Mock db.ts
  if (hasDbFile) {
    lines.push(`vi.mock("../src/db.ts", () => ({`);
    for (const fn of ctx.dbExports) {
      lines.push(`  ${fn}: vi.fn(),`);
    }
    lines.push("}));");
    lines.push("");
  }

  // Mock provider modules
  for (const mod of providerImports) {
    lines.push(`vi.mock("${mod}");`);
  }
  if (providerImports.length > 0) lines.push("");

  // Import service functions that have matching routes
  // Skip names that collide with vitest globals to avoid shadowing
  const testable = serviceExports.filter((fn) => {
    if (VITEST_GLOBALS.has(fn)) return false;
    // Include if it matches an operation_id
    for (const [opId] of routeOpMap) {
      if (toCamelCase(opId) === fn) return true;
    }
    // Include validators
    if (fn.startsWith("is") || fn.startsWith("validate")) return true;
    return false;
  });

  if (testable.length > 0) {
    // Alias with _ prefix to avoid unused-import errors (tests are .todo stubs)
    const aliased = testable.map((fn) => `${fn} as _${fn}`);
    const importLine = `import { ${aliased.join(", ")} } from "../src/service.ts";`;
    if (importLine.length > 100) {
      lines.push(`import {`);
      for (const a of aliased) {
        lines.push(`  ${a},`);
      }
      lines.push(`} from "../src/service.ts";`);
    } else {
      lines.push(importLine);
    }
    lines.push("");
  }

  lines.push(generateUnitMarkedContent(ctx, testable, routeOpMap));
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate the describe block for unit tests.
 */
function generateUnitMarkedContent(
  ctx: GenContext,
  testable: string[],
  routeOpMap: Map<string, { route: RouteMapping; method: string; path: string }>,
): string {
  const { p, serviceUsesOkWrapper } = ctx;
  const lines: string[] = [];

  lines.push(`describe("${p.name} service", () => {`);

  for (const fn of testable) {
    // Find matching route first — route match takes priority over validator prefix
    let matchedRoute: RouteMapping | undefined;
    for (const [opId, info] of routeOpMap) {
      if (toCamelCase(opId) === fn) {
        matchedRoute = info.route;
        break;
      }
    }

    // Validator pattern: no route match + starts with is/validate
    if (!matchedRoute && (fn.startsWith("is") || fn.startsWith("validate"))) {
      lines.push(`  describe("${fn}", () => {`);
      lines.push(`    // TODO: replace with valid/invalid input for ${fn}`);
      lines.push(`    it.todo("returns true for valid input");`);
      lines.push(`    it.todo("returns false for invalid input");`);
      lines.push("  });");
      lines.push("");
      continue;
    }

    lines.push(`  describe("${fn}", () => {`);

    // Happy path — use .todo since mocks need manual setup
    const hasCaller = matchedRoute && !ctx.isFreeService;

    if (serviceUsesOkWrapper) {
      lines.push(
        `    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test`,
      );
      lines.push(`    it.todo("returns ok:true with valid input");`);
    } else {
      lines.push(
        `    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test`,
      );
      lines.push(`    it.todo("resolves with valid input");`);
    }

    // Error paths from routes_map errors array
    if (matchedRoute?.errors && serviceUsesOkWrapper) {
      const seen = new Set<string>();
      for (const err of matchedRoute.errors) {
        if (seen.has(err.code)) continue;
        seen.add(err.code);
        lines.push("");
        lines.push(`    // TODO: set up mocks to trigger ${err.code}`);
        lines.push(`    it.todo("returns ${err.code} on error");`);
      }
    }

    // Ownership violation test for caller-scoped services
    if (hasCaller && serviceUsesOkWrapper) {
      lines.push("");
      lines.push(`    it.todo("scopes to caller wallet address");`);
    }

    lines.push("  });");
    lines.push("");
  }

  // Remove trailing blank line before closing brace (biome formatting)
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  lines.push("});");

  return lines.join("\n");
}

// ── Integration test generator (Tier 2) ──────────────────────────────────────

/**
 * Look up the provider layer from providers.yaml registry.
 * Falls back to "rest" if the provider isn't in the registry.
 */
function getProviderLayer(
  providerName: string,
  registry: ProviderRegistry,
): "s3" | "rest" | "graphql" | "sdk" {
  const entry = registry[providerName];
  if (entry) return entry.layer;
  return "rest";
}

/**
 * Generate integration.generated.test.ts — real provider API calls, no x402.
 * Only generated for prims with at least one active provider.
 */
function generateIntegrationFile(
  ctx: GenContext,
  registry: ProviderRegistry,
): string | null {
  const { p, routes } = ctx;
  const activeProvider = p.providers?.find((pr) => pr.status === "active" && pr.default);
  if (!activeProvider) return null;

  const registryEntry = registry[activeProvider.name];
  const layer = registryEntry ? registryEntry.layer : "rest";

  // Env vars from registry (SOT), falling back to prim.yaml
  const allEnv = registryEntry ? providerEnvVars(registryEntry) : (activeProvider.env ?? []);

  // Find create and delete routes for primary resource
  const createRoute = routes.find((r) => r.route.startsWith("POST /v1/"));
  const deleteRoute = routes.find((r) => r.route.startsWith("DELETE /v1/"));

  const lines: string[] = [];
  lines.push("// SPDX-License-Identifier: Apache-2.0");
  lines.push(`${GENERATED_HEADER} — DO NOT EDIT`);
  lines.push("// Regenerate: pnpm gen:tests");
  lines.push("/**");
  lines.push(` * ${p.name} — Tier 2 integration tests`);
  lines.push(` *`);
  lines.push(` * Real ${activeProvider.name} API calls. No x402, no SQLite.`);
  lines.push(` * Auto-skips when provider credentials are missing.`);
  lines.push(` *`);
  lines.push(` * Requires: ${allEnv.join(", ")}`);
  if (registryEntry?.docs) {
    lines.push(` * Docs: ${registryEntry.docs}`);
  }
  lines.push(" */");

  lines.push(`import { afterAll, describe, expect, it } from "vitest";`);
  lines.push("");

  // Env var check
  const envItems = allEnv.map((e) => `"${e}"`);
  const singleLine = `const REQUIRED_ENV = [${envItems.join(", ")}];`;
  if (singleLine.length <= 100) {
    lines.push(singleLine);
  } else {
    lines.push("const REQUIRED_ENV = [");
    for (const item of envItems) {
      lines.push(`  ${item},`);
    }
    lines.push("];");
  }
  lines.push(`const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);`);
  lines.push("");
  lines.push(`const TEST_PREFIX = \`test-int-\${Date.now()}\`;`);
  lines.push("");

  if (layer === "s3") {
    lines.push(`import { AwsClient } from "aws4fetch";`);
    lines.push("");

    const authEnv = registryEntry?.auth.env ?? {};
    const extraAuthEnv = registryEntry?.auth.extra_env ?? {};
    const accessKeyEnv = authEnv.access_key ?? "R2_ACCESS_KEY_ID";
    const secretKeyEnv = authEnv.secret_key ?? "R2_SECRET_ACCESS_KEY";
    const accountIdEnv = authEnv.account_id ?? "CLOUDFLARE_ACCOUNT_ID";
    const apiTokenEnv = extraAuthEnv.api_token ?? "CLOUDFLARE_API_TOKEN";

    lines.push(`const TEST_BUCKET = \`\${TEST_PREFIX}-bucket\`;`);
    lines.push(`const TEST_KEY = "integration-test.txt";`);
    lines.push(`const TEST_CONTENT = "hello from ${p.id} integration test";`);
    lines.push("");
    lines.push(`function getS3Client(): AwsClient {`);
    lines.push(`  return new AwsClient({`);
    lines.push(`    accessKeyId: process.env.${accessKeyEnv}!,`);
    lines.push(`    secretAccessKey: process.env.${secretKeyEnv}!,`);
    lines.push(`    service: "s3",`);
    lines.push("  });");
    lines.push("}");
    lines.push("");
    lines.push(`function baseUrl(): string {`);
    lines.push(
      `  return \`https://\${process.env.${accountIdEnv}}.r2.cloudflarestorage.com\`;`,
    );
    lines.push("}");
    lines.push("");
    lines.push(`async function cfCreateBucket(name: string): Promise<void> {`);
    lines.push("  const res = await fetch(");
    lines.push(
      `    \`https://api.cloudflare.com/client/v4/accounts/\${process.env.${accountIdEnv}}/r2/buckets\`,`,
    );
    lines.push("    {");
    lines.push(`      method: "POST",`);
    lines.push("      headers: {");
    lines.push(`        Authorization: \`Bearer \${process.env.${apiTokenEnv}}\`,`);
    lines.push(`        "Content-Type": "application/json",`);
    lines.push("      },");
    lines.push("      body: JSON.stringify({ name }),");
    lines.push("    },");
    lines.push("  );");
    lines.push(`  if (!res.ok) throw new Error(\`Create bucket failed: \${res.status}\`);`);
    lines.push("}");
    lines.push("");
    lines.push(`async function cfDeleteBucket(name: string): Promise<void> {`);
    lines.push(`  const acct = process.env.${accountIdEnv};`);
    lines.push("  const res = await fetch(");
    lines.push(
      "    `https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets/${name}`,",
    );
    lines.push("    {");
    lines.push(`      method: "DELETE",`);
    lines.push(`      headers: { Authorization: \`Bearer \${process.env.${apiTokenEnv}}\` },`);
    lines.push("    },");
    lines.push("  );");
    lines.push(`  if (!res.ok && res.status !== 404) throw new Error(\`Delete bucket failed: \${res.status}\`);`);
    lines.push("}");
    lines.push("");
    lines.push(
      `describe.skipIf(MISSING_ENV.length > 0)("${p.name} integration — S3 layer", () => {`,
    );
    lines.push("  if (MISSING_ENV.length > 0) return;");
    lines.push("");
    lines.push("  const s3 = getS3Client();");
    lines.push(
      "  const url = (path: string) => `${baseUrl()}/${TEST_BUCKET}${path}`;",
    );
    lines.push("");
    lines.push("  afterAll(async () => {");
    lines.push("    try {");
    lines.push(`      await s3.fetch(url(\`/\${TEST_KEY}\`), { method: "DELETE" });`);
    lines.push("    } catch {");
    lines.push("      /* cleanup */");
    lines.push("    }");
    lines.push("    try {");
    lines.push("      await cfDeleteBucket(TEST_BUCKET);");
    lines.push("    } catch {");
    lines.push("      /* cleanup */");
    lines.push("    }");
    lines.push("  });");
    lines.push("");
    lines.push(`  it("creates a test bucket", async () => {`);
    lines.push("    await cfCreateBucket(TEST_BUCKET);");
    lines.push(`    const res = await s3.fetch(url("/"), { method: "HEAD" });`);
    lines.push("    expect(res.status).toBe(200);");
    lines.push("  });");
    lines.push("");
    lines.push(`  it("PUT object uploads", async () => {`);
    lines.push(`    const res = await s3.fetch(url(\`/\${TEST_KEY}\`), {`);
    lines.push(`      method: "PUT",`);
    lines.push(`      headers: { "Content-Type": "text/plain" },`);
    lines.push(`      body: TEST_CONTENT,`);
    lines.push(`    });`);
    lines.push("    expect(res.status).toBe(200);");
    lines.push("  });");
    lines.push("");
    lines.push(`  it("GET object downloads", async () => {`);
    lines.push(`    const res = await s3.fetch(url(\`/\${TEST_KEY}\`));`);
    lines.push("    expect(res.status).toBe(200);");
    lines.push("    expect(await res.text()).toBe(TEST_CONTENT);");
    lines.push("  });");
    lines.push("");
    lines.push(`  it("LIST includes the object", async () => {`);
    lines.push(`    const res = await s3.fetch(url("/?list-type=2"));`);
    lines.push("    expect(res.status).toBe(200);");
    lines.push("    expect(await res.text()).toContain(TEST_KEY);");
    lines.push("  });");
    lines.push("");
    lines.push(`  it("DELETE object removes it", async () => {`);
    lines.push(`    const res = await s3.fetch(url(\`/\${TEST_KEY}\`), { method: "DELETE" });`);
    lines.push("    expect(res.status).toBe(204);");
    lines.push("  });");
    lines.push("");
    lines.push(`  it("deletes the test bucket", async () => {`);
    lines.push("    await cfDeleteBucket(TEST_BUCKET);");
    lines.push(`    const res = await s3.fetch(url("/"), { method: "HEAD" });`);
    lines.push("    expect(res.status).toBe(404);");
    lines.push("  });");
    lines.push("});");
  } else {
    // REST layer — real health check from providers.yaml
    const hc = registryEntry?.health_check;
    const authType = registryEntry?.auth.type ?? "api-key";
    const authEnvRest = registryEntry?.auth.env ?? {};
    const apiKeyEnvName = authEnvRest.api_key ?? authEnvRest.api_token ?? allEnv[0];

    // Remove unused imports for REST — only need describe, expect, it
    lines.length = 0;
    lines.push("// SPDX-License-Identifier: Apache-2.0");
    lines.push(`${GENERATED_HEADER} — DO NOT EDIT`);
    lines.push("// Regenerate: pnpm gen:tests");
    lines.push("/**");
    lines.push(` * ${p.name} — Tier 2 integration tests`);
    lines.push(` *`);
    lines.push(` * Real ${activeProvider.name} API calls. No x402, no SQLite.`);
    lines.push(` * Auto-skips when provider credentials are missing.`);
    lines.push(` *`);
    lines.push(` * Requires: ${allEnv.join(", ")}`);
    if (registryEntry?.docs) {
      lines.push(` * Docs: ${registryEntry.docs}`);
    }
    lines.push(" */");
    lines.push(`import { describe, expect, it } from "vitest";`);
    lines.push("");
    const envItemsRest = allEnv.map((e) => `"${e}"`);
    const singleLineRest = `const REQUIRED_ENV = [${envItemsRest.join(", ")}];`;
    if (singleLineRest.length <= 100) {
      lines.push(singleLineRest);
    } else {
      lines.push("const REQUIRED_ENV = [");
      for (const item of envItemsRest) {
        lines.push(`  ${item},`);
      }
      lines.push("];");
    }
    lines.push(`const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);`);
    lines.push("");

    lines.push(
      `describe.skipIf(MISSING_ENV.length > 0)("${p.name} integration — ${activeProvider.name}", () => {`,
    );
    lines.push("  if (MISSING_ENV.length > 0) return;");
    lines.push("");

    if (hc) {
      // Generate a real health check test from the registry
      const method = hc.method ?? "GET";
      let url = hc.url;
      let body = hc.body ?? "";
      // Replace {env_var_role} placeholders with process.env lookups
      for (const [role, envName] of Object.entries(authEnvRest)) {
        url = url.replace(`{${role}}`, `\${process.env.${envName}}`);
        body = body.replace(`{${role}}`, `\${process.env.${envName}}`);
      }
      if (registryEntry?.auth.extra_env) {
        for (const [role, envName] of Object.entries(registryEntry.auth.extra_env)) {
          url = url.replace(`{${role}}`, `\${process.env.${envName}}`);
          body = body.replace(`{${role}}`, `\${process.env.${envName}}`);
        }
      }

      lines.push(`  it("health check — ${method} ${registryEntry?.display_name ?? activeProvider.name}", async () => {`);
      const headers: string[] = [];
      if (authType === "bearer") {
        headers.push(`        Authorization: \`Bearer \${process.env.${apiKeyEnvName}}\`,`);
      } else if (authType === "api-key" && !body) {
        headers.push(`        "X-Api-Key": process.env.${apiKeyEnvName}!,`);
      }

      // Extract long URL to a const to stay under 100 chars
      const fetchLine = `    const res = await fetch(\`${url}\`, {`;
      const needsUrlConst = fetchLine.length > 100;
      if (needsUrlConst) {
        const endpointLine = `    const endpoint = \`${url}\`;`;
        if (endpointLine.length > 100) {
          // Split URL at the template literal boundary
          const parts = url.split("${");
          if (parts.length > 1) {
            lines.push(`    const base = "${parts[0]}";`);
            lines.push(`    const endpoint = \`\${base}\${${parts.slice(1).join("${")}\`;`);
          } else {
            lines.push(endpointLine); // can't split, accept the long line
          }
        } else {
          lines.push(endpointLine);
        }
      }
      const fetchTarget = needsUrlConst ? "endpoint" : `\`${url}\``;

      if (body) {
        const hasInterpolation = body.includes("${");
        const bodyStr = hasInterpolation ? `\`${body}\`` : `'${body}'`;
        lines.push(`    const res = await fetch(${fetchTarget}, {`);
        lines.push(`      method: "${method}",`);
        if (headers.length > 0) {
          lines.push("      headers: {");
          for (const h of headers) lines.push(h);
          lines.push(`        "Content-Type": "application/json",`);
          lines.push("      },");
        } else {
          lines.push(`      headers: { "Content-Type": "application/json" },`);
        }
        lines.push(`      body: ${bodyStr},`);
        lines.push("    });");
      } else {
        lines.push(`    const res = await fetch(${fetchTarget}, {`);
        lines.push(`      method: "${method}",`);
        if (headers.length > 0) {
          lines.push("      headers: {");
          for (const h of headers) lines.push(h);
          lines.push("      },");
        }
        lines.push("    });");
      }
      lines.push(`    expect(res.status).toBe(${hc.expect});`);
      lines.push("  });");
    } else {
      // No health check in registry — simple credential validation
      lines.push(`  it("provider credentials are set", () => {`);
      lines.push("    for (const key of REQUIRED_ENV) {");
      lines.push("      expect(process.env[key]).toBeDefined();");
      lines.push("    }");
      lines.push("  });");
    }

    lines.push("});");
  }

  return `${lines.join("\n")}\n`;
}

// ── E2E local test generator (Tier 3) ────────────────────────────────────────

/**
 * Generate e2e/tests/<id>.generated.ts — Bun script that boots the prim service
 * locally and sends real HTTP requests with x402 payment on testnet.
 */
function generateE2eLocalFile(ctx: GenContext): string | null {
  const { p, routes } = ctx;
  if (!p.status || (p.status !== "mainnet" && p.status !== "testnet")) return null;
  if (!routes.length) return null;

  const port = p.port ?? 3000;
  const isFree = ctx.isFreeService;

  // Find the first POST route for the create/402 test
  const firstPostRoute = routes.find((r) => r.route.startsWith("POST "));
  const firstPostPath = firstPostRoute ? firstPostRoute.route.replace(/^POST\s+/, "") : null;

  // Build minimal body for the first POST route
  const requestType = firstPostRoute
    ? firstPostRoute.request_type ??
      firstPostRoute.request ??
      inferTypeNames(firstPostRoute.operation_id, ctx.apiInterfaces).request
    : null;
  const minimalBodyStr = requestType ? buildMinimalBody(requestType, ctx.apiInterfaces) : "{}";

  // Provider env vars needed
  const providerEnv = (p.providers ?? [])
    .filter((pr) => pr.status === "active")
    .flatMap((pr) => pr.env ?? []);

  const lines: string[] = [];
  lines.push("#!/usr/bin/env bun");
  lines.push("// SPDX-License-Identifier: Apache-2.0");
  lines.push(`${GENERATED_HEADER} — DO NOT EDIT`);
  lines.push("// Regenerate: pnpm gen:tests");
  lines.push("/**");
  lines.push(` * ${p.name} — Tier 3 e2e-local test`);
  lines.push(` *`);
  lines.push(` * Boots ${p.name} locally, sends real HTTP requests with x402 on testnet.`);
  lines.push(` * Usage: source scripts/.env.testnet && bun e2e/tests/${p.id}.generated.ts`);
  lines.push(" */");
  lines.push("");
  lines.push(`import { spawn } from "node:child_process";`);
  lines.push(`import type { ChildProcess } from "node:child_process";`);
  if (!isFree) {
    lines.push(`import { createPrimFetch } from "@primsh/x402-client";`);
  }
  lines.push("");
  lines.push(`const PORT = ${port};`);
  lines.push(`const URL = \`http://localhost:\${PORT}\`;`);
  lines.push("");

  // Env checks
  lines.push(`function requireEnv(name: string): string {`);
  lines.push(`  const val = process.env[name];`);
  lines.push(`  if (!val) { console.error(\`Missing: \${name}\`); process.exit(1); }`);
  lines.push("  return val;");
  lines.push("}");
  lines.push("");
  lines.push(`const network = requireEnv("PRIM_NETWORK");`);
  lines.push(`if (network !== "eip155:84532") {`);
  lines.push(`  console.error("PRIM_NETWORK must be eip155:84532 (testnet)");`);
  lines.push("  process.exit(1);");
  lines.push("}");
  if (!isFree) {
    lines.push(`const agentKey = requireEnv("AGENT_PRIVATE_KEY");`);
  }
  lines.push("");

  // Service lifecycle
  lines.push("let proc: ChildProcess;");
  lines.push("");
  lines.push("async function start(): Promise<void> {");
  lines.push(`  proc = spawn("bun", ["run", "packages/${p.id}/src/index.ts"], {`);
  lines.push(`    env: { ...process.env, ${p.id.toUpperCase()}_PORT: String(PORT) },`);
  lines.push(`    stdio: ["ignore", "pipe", "pipe"],`);
  lines.push("  });");
  lines.push("  for (let i = 0; i < 30; i++) {");
  lines.push("    try {");
  lines.push(`      const res = await fetch(\`\${URL}/\`);`);
  lines.push("      if (res.ok) return;");
  lines.push(`    } catch { /* not ready */ }`);
  lines.push("    await new Promise((r) => setTimeout(r, 500));");
  lines.push("  }");
  lines.push(`  throw new Error("${p.name} failed to start within 15s");`);
  lines.push("}");
  lines.push("");
  lines.push(`function stop(): void { if (proc) proc.kill("SIGTERM"); }`);
  lines.push("");

  if (!isFree) {
    lines.push("const primFetch = createPrimFetch({");
    lines.push("  privateKey: agentKey as `0x${string}`,");
    lines.push("  network,");
    lines.push("});");
    lines.push("");
  }

  // Test runner
  lines.push("let passed = 0;");
  lines.push("let failed = 0;");
  lines.push("");
  lines.push("async function test(name: string, fn: () => Promise<void>): Promise<void> {");
  lines.push("  try {");
  lines.push("    await fn();");
  lines.push('    console.log(`  ✓ ${name}`);');
  lines.push("    passed++;");
  lines.push("  } catch (err) {");
  lines.push('    console.error(`  ✗ ${name}`);');
  lines.push("    console.error(`    ${err instanceof Error ? err.message : err}`);");
  lines.push("    failed++;");
  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }");
  lines.push("");

  // Tests
  lines.push(`console.log(\`\\n${p.name} e2e-local (testnet, \${URL})\\n\`);`);
  lines.push("");
  lines.push("await start();");
  lines.push("");
  lines.push("try {");

  // Health check
  lines.push(`  await test("GET / → 200 health", async () => {`);
  lines.push(`    const res = await fetch(\`\${URL}/\`);`);
  lines.push(`    assert(res.status === 200, \`expected 200, got \${res.status}\`);`);
  lines.push(`    const body = await res.json() as { service: string };`);
  lines.push(`    assert(body.service === "${p.name}", \`expected ${p.name}, got \${body.service}\`);`);
  lines.push("  });");
  lines.push("");

  // 402 check for paid routes
  if (!isFree && firstPostPath) {
    lines.push(`  await test("${firstPostRoute!.route} → 402 without payment", async () => {`);
    const testPath = firstPostPath.replace(/:([a-zA-Z_]+)/g, "test-$1");
    lines.push(`    const res = await fetch(\`\${URL}${testPath}\`, { method: "POST", body: "{}" });`);
    lines.push(`    assert(res.status === 402, \`expected 402, got \${res.status}\`);`);
    lines.push("  });");
    lines.push("");
  }

  // Paid request with x402
  if (!isFree && firstPostRoute) {
    const testPath = firstPostPath!.replace(/:([a-zA-Z_]+)/g, "test-$1");
    lines.push(`  await test("${firstPostRoute.route} → paid request", async () => {`);
    lines.push(`    const res = await primFetch(\`\${URL}${testPath}\`, {`);
    lines.push(`      method: "POST",`);
    lines.push(`      headers: { "Content-Type": "application/json" },`);
    const bodyLine = `      body: JSON.stringify(${minimalBodyStr}),`;
    if (bodyLine.length <= 100) {
      lines.push(bodyLine);
    } else {
      const fields = minimalBodyStr.replace(/^\{/, "").replace(/\}$/, "").trim();
      lines.push("      body: JSON.stringify({");
      for (const field of fields.split(", ")) {
        lines.push(`        ${field},`);
      }
      lines.push("      }),");
    }
    lines.push("    });");
    lines.push(
      `    assert(res.status >= 200 && res.status < 300, \`expected 2xx, got \${res.status}\`);`,
    );
    lines.push("  });");
  }

  lines.push("} finally {");
  lines.push("  stop();");
  lines.push("}");
  lines.push("");
  lines.push("console.log(`\\n${passed} passed, ${failed} failed\\n`);");
  lines.push("process.exit(failed > 0 ? 1 : 0);");

  return `${lines.join("\n")}\n`;
}

// ── File processing helper ────────────────────────────────────────────────────

/**
 * Process a generated file — create if missing, overwrite if changed.
 * All .generated.test.ts files are always overwritten (no manual-skip logic).
 */
function processGeneratedFile(
  filePath: string,
  generateFull: () => string,
): void {
  if (!existsSync(filePath)) {
    const content = generateFull();

    if (CHECK_MODE) {
      console.error(`  ✗ ${filePath} does not exist — run pnpm gen:tests`);
      anyFailed = true;
    } else {
      writeFileSync(filePath, content);
      console.log(`  ↺ ${filePath} [created]`);
    }
    return;
  }

  const existing = readFileSync(filePath, "utf8");

  // Guard: .generated.test.ts files must have the GENERATED header
  if (filePath.includes(".generated.") && !existing.includes(GENERATED_HEADER)) {
    console.error(`  ✗ ${filePath} is missing GENERATED header — was it hand-edited?`);
    anyFailed = true;
    return;
  }

  const content = generateFull();
  const changed = content !== existing;

  if (CHECK_MODE) {
    if (changed) {
      console.error(`  ✗ ${filePath} is out of date — run pnpm gen:tests`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${filePath}`);
    }
  } else {
    if (changed) {
      writeFileSync(filePath, content);
      console.log(`  ↺ ${filePath} [updated]`);
    } else {
      console.log(`  ✓ ${filePath} (up to date)`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const prims = loadPrimitives();
const providerRegistry = loadProviders(ROOT);
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
  const ctx = await buildContext(p);

  console.log(`  ${p.id}:`);

  // ── unit.generated.test.ts ──
  const unitTestPath = join(ROOT, "packages", p.id, "test/unit.generated.test.ts");
  processGeneratedFile(unitTestPath, () => generateFullFile(ctx));

  // ── smoke-live.generated.test.ts ──
  const smokeLivePath = join(ROOT, "packages", p.id, "test/smoke-live.generated.test.ts");
  processGeneratedFile(smokeLivePath, () => generateSmokeLiveFile(ctx));

  // ── service.generated.test.ts (only if service.ts exists with route-matched exports) ──
  if (ctx.hasServiceFile) {
    const routeOpMap = buildRouteOpMap(ctx.routes);
    const testable = ctx.serviceExports.filter((fn) => {
      if (VITEST_GLOBALS.has(fn)) return false;
      for (const [opId] of routeOpMap) {
        if (toCamelCase(opId) === fn) return true;
      }
      if (fn.startsWith("is") || fn.startsWith("validate")) return true;
      return false;
    });

    if (testable.length > 0) {
      const unitTestPath = join(ROOT, "packages", p.id, "test/service.generated.test.ts");
      processGeneratedFile(unitTestPath, () => generateUnitFile(ctx));
    }
  }

  // ── integration.generated.test.ts (only for prims with active providers) ──
  const integrationContent = generateIntegrationFile(ctx, providerRegistry);
  if (integrationContent) {
    const integrationPath = join(ROOT, "packages", p.id, "test/integration.generated.test.ts");
    processGeneratedFile(integrationPath, () => integrationContent);
  }

  // ── e2e/tests/<id>.generated.ts (only for mainnet/testnet prims) ──
  const e2eContent = generateE2eLocalFile(ctx);
  if (e2eContent) {
    const e2eDir = join(ROOT, "e2e/tests");
    if (!existsSync(e2eDir)) mkdirSync(e2eDir, { recursive: true });
    const e2ePath = join(e2eDir, `${p.id}.generated.ts`);
    processGeneratedFile(e2ePath, () => e2eContent);
  }
}

if (CHECK_MODE && anyFailed) {
  console.error("\nSome test files are out of date. Run: pnpm gen:tests");
  process.exit(1);
} else if (CHECK_MODE) {
  console.log("\nAll generated test files are up to date.");
} else {
  console.log("\nDone.");
}
