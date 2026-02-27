#!/usr/bin/env bun
/**
 * gen-gate.ts — Smoke test plan generator
 *
 * Reads prim.yaml routes_map for live prims and generates missing
 * test entries in tests/smoke-test-plan.json. Hand-written tests (without
 * `"generated": true`) are never overwritten.
 *
 * Usage:
 *   bun scripts/gen-gate.ts          # generate missing tests
 *   bun scripts/gen-gate.ts --check  # verify no missing tests, exit 1 if gaps
 *   bun scripts/gen-gate.ts wallet   # generate for a specific prim only
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadPrimitives, deployed, withPackage, type Primitive, type RouteMapping } from "./lib/primitives.js";
import { parseApiFile, type ParsedInterface, type ParsedField } from "./lib/parse-api.js";

const ROOT = resolve(import.meta.dir, "..");
const PLAN_PATH = join(ROOT, "tests", "smoke-test-plan.json");
const CHECK_MODE = process.argv.includes("--check");
const TARGET_ID = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]);

// ── ID prefix mapping ──────────────────────────────────────────────────────

const PRIM_PREFIX: Record<string, string> = {
  wallet: "W",
  faucet: "FC",
  store: "ST",
  search: "SE",
  email: "E",
  spawn: "SP",
  infer: "INF",
  track: "TR",
  token: "TK",
  domain: "D",
  mem: "M",
};

// ── Types ──────────────────────────────────────────────────────────────────

interface TestPlan {
  plan: string;
  version: number;
  network: string;
  context: string;
  groups: GroupDef[];
  tests: TestDef[];
}

interface GroupDef {
  id: string;
  name: string;
  prompt: string;
  tests: string[];
}

interface TestDef {
  id: string;
  service: string;
  test: string;
  method: string;
  endpoint: string;
  input: unknown;
  expected: { status: number; body?: Record<string, unknown>; body_equals?: string };
  depends_on: string[];
  captures: Record<string, string>;
  notes: string | null;
  actual_status?: number | null;
  actual_body?: unknown;
  result?: string | null;
  run_note?: string | null;
  generated?: boolean;
}

// ── Route helpers ──────────────────────────────────────────────────────────

function parseRoute(route: string): { method: string; path: string } {
  const [method, ...rest] = route.trim().split(/\s+/);
  return { method, path: rest.join(" ") };
}

/**
 * Normalize a test's method + endpoint into a route key for matching.
 * Strips query params, replaces {{vars}} with :param, and normalizes
 * literal path segments that look like object keys (e.g., "hello.txt")
 * to :param so they match prim.yaml's `:key` parameter.
 */
function normalizeTestRoute(method: string, endpoint: string): string {
  let url = endpoint.split("?")[0]; // strip query params
  url = url.replace(/\{\{[^}]+\}\}/g, ":param"); // {{var}} → :param

  // Normalize path segments after /objects/ that aren't :param (literal keys like "hello.txt")
  url = url.replace(/(\/objects\/)([^/:][^/]*)/, "$1:param");

  return `${method} ${url}`;
}

/**
 * Normalize a prim.yaml route into the same key format.
 */
function normalizeYamlRoute(method: string, endpoint: string, path: string): string {
  const url = `https://${endpoint}${path}`.replace(/:[^/]+/g, ":param");
  return `${method} ${url}`;
}

/**
 * Convert a route path like "/v1/wallets/:address/policy"
 * to an endpoint URL like "https://wallet.prim.sh/v1/wallets/{{agent_address}}/policy"
 */
function routeToEndpoint(prim: Primitive, path: string): string {
  const base = `https://${prim.endpoint}`;
  const resolved = path.replace(/:(\w+)/g, (_, param: string) => {
    return `{{${paramToVar(prim.id, param, path)}}}`;
  });
  return `${base}${resolved}`;
}

/**
 * Map a route parameter to a template variable name.
 * :address → agent_address
 * :id → <resource>_id (derived from parent path segment)
 * :key → object_key
 * :msgId → message_id
 * :whId → webhook_id
 */
function paramToVar(primId: string, param: string, path: string): string {
  if (param === "address") return "agent_address";
  if (param === "key") return "object_key";
  if (param === "msgId") return "message_id";
  if (param === "whId") return "webhook_id";

  if (param === "id") {
    // Derive resource name from the path segment before :id
    const segments = path.split("/").filter(Boolean);
    const idxOfId = segments.indexOf(":id");
    if (idxOfId > 0) {
      const resource = segments[idxOfId - 1];
      return `${singularize(resource)}_id`;
    }
    return `${primId}_id`;
  }

  // camelCase param → snake_case
  return param.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function singularize(word: string): string {
  // Simple singularization for common resource names
  const map: Record<string, string> = {
    wallets: "wallet",
    buckets: "bucket",
    servers: "server",
    mailboxes: "mailbox",
    messages: "message",
    domains: "domain",
    webhooks: "webhook",
    objects: "object",
    models: "model",
    "ssh-keys": "ssh_key",
    "fund-requests": "fund_request",
  };
  return map[word] ?? word.replace(/s$/, "").replace(/-/g, "_");
}

/**
 * Determine if a route is free (no x402 payment).
 */
function isFreeRoute(route: RouteMapping): boolean {
  const notes = route.notes?.toLowerCase() ?? "";
  return notes.includes("free") || !route.errors?.some((e) => e.status === 402);
}

// ── Response shape builder ─────────────────────────────────────────────────

/**
 * Build an expected body shape from a response type's fields.
 * Maps TypeScript types to shape-matcher notation:
 *   string → "string"
 *   number → "number"
 *   boolean → "boolean"
 *   Type[] → "array (non-empty)"
 *   nested object → recurse
 */
function buildExpectedShape(
  typeName: string | null | undefined,
  interfaces: Map<string, ParsedInterface>,
): Record<string, unknown> | undefined {
  if (!typeName) return undefined;
  const iface = interfaces.get(typeName);
  if (!iface || iface.fields.length === 0) return undefined;

  const shape: Record<string, unknown> = {};
  for (const field of iface.fields) {
    if (field.optional) continue; // only required fields in shape check
    shape[field.name] = fieldToShape(field, interfaces);
  }
  return Object.keys(shape).length > 0 ? shape : undefined;
}

function fieldToShape(field: ParsedField, interfaces: Map<string, ParsedInterface>): unknown {
  const type = field.type.replace(/\s*\|\s*null\s*$/, "").replace(/^\s*null\s*\|\s*/, "").trim();

  if (type.endsWith("[]")) {
    return "array (non-empty)";
  }
  if (type === "string") return "string";
  if (type === "number") return "number";
  if (type === "boolean") return "boolean";
  if (type === "object") return "string"; // generic, just check exists

  // Known literal types
  if (type.startsWith('"') || type.includes('" | "')) return "string";

  // Check if it's a known interface
  const nested = interfaces.get(type);
  if (nested) {
    const nestedShape: Record<string, unknown> = {};
    for (const f of nested.fields) {
      if (f.optional) continue;
      nestedShape[f.name] = fieldToShape(f, interfaces);
    }
    return Object.keys(nestedShape).length > 0 ? nestedShape : "string";
  }

  return "string";
}

// ── Input builder ──────────────────────────────────────────────────────────

/**
 * Build synthetic request input from a request type's required fields.
 */
function buildSyntheticInput(
  typeName: string | null | undefined,
  interfaces: Map<string, ParsedInterface>,
): Record<string, unknown> | null {
  if (!typeName) return null;
  const iface = interfaces.get(typeName);
  if (!iface || iface.fields.length === 0) return {};

  const input: Record<string, unknown> = {};
  for (const field of iface.fields) {
    if (field.optional) continue;
    input[field.name] = syntheticValue(field);
  }
  return Object.keys(input).length > 0 ? input : {};
}

function syntheticValue(field: ParsedField): unknown {
  const name = field.name.toLowerCase();
  const type = field.type.toLowerCase();

  if (name === "address" || name.endsWith("address")) return "{{agent_address}}";
  if (name === "name") return "{{test_prefix}}-test";
  if (name === "query") return "test query";
  if (name === "model") return "anthropic/claude-sonnet-4";
  if (name === "input" && type.includes("string")) return "test input";
  if (name === "messages") return [{ role: "user", content: "Hello" }];
  if (name === "to") return "{{mailbox_address}}";
  if (name === "subject") return "Gate runner test";
  if (name === "body" && type === "string") return "Test email body";
  if (name === "amount") return "1.00";
  if (name === "reason") return "Gate runner test funding";
  if (name === "domain") return "{{test_prefix}}.example.com";
  if (name === "url" || name === "urls") return "https://example.com";
  if (name === "public_key") return "{{ssh_pubkey}}";
  if (name === "type") return "small";
  if (name === "image") return "ubuntu-24.04";
  if (name === "location") return "nyc3";
  if (name === "ssh_keys") return ["{{ssh_key_id}}"];

  if (type === "string" || type.startsWith("string")) return "test";
  if (type === "number") return 1;
  if (type === "boolean") return true;
  if (type.endsWith("[]")) return [];

  return "test";
}

// ── Dependency inference ───────────────────────────────────────────────────

/**
 * Infer depends_on for a generated test.
 * - Health check: no deps
 * - Free routes: depend on health check only
 * - Paid routes with no path params: depend on health + F-1 (funding)
 * - Paid routes with path params: depend on the create test for that resource
 */
function inferDependsOn(
  prim: Primitive,
  route: RouteMapping,
  healthTestId: string,
  testIndex: Map<string, string>, // route key → test ID
): string[] {
  const { path } = parseRoute(route.route);
  const deps: string[] = [];

  // Always depend on health check
  deps.push(healthTestId);

  // Paid routes depend on funding
  if (!isFreeRoute(route)) {
    deps.push("F-1");
  }

  // Routes with path params depend on the create endpoint
  if (path.includes(":")) {
    // Find the "parent" create route
    // e.g., /v1/buckets/:id/objects → depends on POST /v1/buckets
    const segments = path.split("/").filter(Boolean);
    const firstParamIdx = segments.findIndex((s) => s.startsWith(":"));
    if (firstParamIdx > 0) {
      const parentPath = "/" + segments.slice(0, firstParamIdx).join("/");
      const createKey = `POST ${parentPath}`;
      const createTestId = testIndex.get(createKey);
      if (createTestId) {
        deps.push(createTestId);
      }
    }
  }

  return [...new Set(deps)];
}

// ── Capture inference ──────────────────────────────────────────────────────

/**
 * Infer captures for a test. POST routes that create resources
 * typically return an ID field that downstream tests need.
 */
function inferCaptures(
  prim: Primitive,
  route: RouteMapping,
  interfaces: Map<string, ParsedInterface>,
): Record<string, string> {
  const { method, path } = parseRoute(route.route);

  // Only POST create routes capture IDs
  if (method !== "POST") return {};

  // Skip if path has params (it's an action, not a create)
  if (path.includes(":")) return {};

  const respType = route.response_type ?? route.response;
  if (!respType) return {};

  const iface = interfaces.get(respType);
  if (!iface) return {};

  // Look for an 'id' field in the response
  const idField = iface.fields.find((f) => f.name === "id");
  if (idField) {
    const segments = path.split("/").filter(Boolean);
    const resource = segments[segments.length - 1];
    const varName = `${singularize(resource)}_id`;
    return { [varName]: "$.id" };
  }

  // Look for a nested object with an 'id' field (e.g., { server: { id: "..." } })
  for (const field of iface.fields) {
    const nested = interfaces.get(field.type);
    if (nested) {
      const nestedId = nested.fields.find((f) => f.name === "id");
      if (nestedId) {
        const varName = `${singularize(field.name)}_id`;
        return { [varName]: `$.${field.name}.id` };
      }
    }
  }

  return {};
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  // Load existing plan
  if (!existsSync(PLAN_PATH)) {
    console.error(`Plan not found: ${PLAN_PATH}`);
    process.exit(1);
  }
  const plan: TestPlan = JSON.parse(readFileSync(PLAN_PATH, "utf8"));

  // Build index of existing tests by normalized route key
  // "GET https://wallet.prim.sh/v1/wallets/:address" → test ID
  const existingRoutes = new Map<string, string>();
  for (const t of plan.tests) {
    // Normalize endpoint: strip query params, replace {{...}} and path-specific
    // literals (like "hello.txt") with :param for matching
    const key = normalizeTestRoute(t.method, t.endpoint);
    existingRoutes.set(key, t.id);
  }

  // Build test ID → route key index (for dependency resolution)
  const testIdToRoute = new Map<string, string>();
  for (const [key, id] of existingRoutes) {
    testIdToRoute.set(id, key);
  }

  // Find max test number per prefix
  const maxIds = new Map<string, number>();
  for (const t of plan.tests) {
    const match = t.id.match(/^([A-Z]+)-(?:[A-Z]*)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const num = Number.parseInt(match[2], 10);
      maxIds.set(prefix, Math.max(maxIds.get(prefix) ?? 0, num));
    }
  }

  // Load prims
  let prims = deployed(withPackage(loadPrimitives(ROOT), ROOT));
  if (TARGET_ID) {
    prims = prims.filter((p) => p.id === TARGET_ID);
    if (prims.length === 0) {
      console.error(`Prim not found or not live: ${TARGET_ID}`);
      process.exit(1);
    }
  }

  const newTests: TestDef[] = [];
  const newGroupTests = new Map<string, string[]>(); // group id → new test IDs

  for (const prim of prims) {
    if (!prim.routes_map || prim.routes_map.length === 0) continue;

    const prefix = PRIM_PREFIX[prim.id] ?? prim.id.toUpperCase();
    let nextNum = (maxIds.get(prefix) ?? 0) + 1;

    // Parse api.ts for response shapes
    const apiPath = join(ROOT, "packages", prim.id, "src", "api.ts");
    const interfaces = existsSync(apiPath) ? parseApiFile(apiPath).interfaces : new Map<string, ParsedInterface>();

    // Build route → test ID index for this prim (existing + new)
    const routeTestIndex = new Map<string, string>();
    for (const [key, id] of existingRoutes) {
      routeTestIndex.set(key.replace(/https:\/\/[^/]+/, "").replace(/:param/g, ":id"), id);
    }

    // Find health check test ID
    const healthKey = `GET https://${prim.endpoint}/`;
    const healthNormalized = `GET ${healthKey.replace(/\{\{[^}]+\}\}/g, ":param")}`;
    let healthTestId = existingRoutes.get(healthNormalized);

    // Also check discovery group health checks
    if (!healthTestId) {
      for (const t of plan.tests) {
        if (t.method === "GET" && t.endpoint === `https://${prim.endpoint}/` && t.test === "Health check") {
          healthTestId = t.id;
          break;
        }
      }
    }

    if (!healthTestId) {
      // Generate a health check test
      const hId = `${prefix}-H1`;
      healthTestId = hId;
      newTests.push({
        id: hId,
        service: prim.name,
        test: "Health check",
        method: "GET",
        endpoint: `https://${prim.endpoint}/`,
        input: null,
        expected: { status: 200, body: { service: prim.name, status: "ok" } },
        depends_on: [],
        captures: {},
        notes: null,
        actual_status: null,
        actual_body: null,
        result: null,
        generated: true,
      });
      if (!newGroupTests.has(prim.id)) newGroupTests.set(prim.id, []);
      newGroupTests.get(prim.id)!.push(hId);
    }

    // Check each route
    for (const route of prim.routes_map) {
      const { method, path } = parseRoute(route.route);
      const key = normalizeYamlRoute(method, prim.endpoint, path);

      if (existingRoutes.has(key)) continue; // already tested

      // Generate test ID
      const testId = `${prefix}-${nextNum}`;
      nextNum++;

      // Also register in route index for dependency resolution
      const routeKey = `${method} ${path.replace(/:[^/]+/g, ":id")}`;
      routeTestIndex.set(routeKey, testId);

      // Build the endpoint URL with template vars
      const endpoint = routeToEndpoint(prim, path);

      // Build expected shape from response type
      const respType = route.response_type ?? route.response;
      const expectedBody = buildExpectedShape(respType, interfaces);

      // Build synthetic input
      const reqType = route.request_type ?? route.request;
      const input = (method === "POST" || method === "PUT")
        ? buildSyntheticInput(reqType, interfaces)
        : null;

      // Infer dependencies
      const deps = inferDependsOn(prim, route, healthTestId, routeTestIndex);

      // Infer captures
      const captures = inferCaptures(prim, route, interfaces);

      // Build notes
      const notes = isFreeRoute(route)
        ? `Free. ${route.description}`
        : `x402 paid. ${route.description}`;

      const test: TestDef = {
        id: testId,
        service: prim.name,
        test: route.description,
        method,
        endpoint,
        input,
        expected: {
          status: route.status ?? 200,
          ...(expectedBody ? { body: expectedBody } : {}),
        },
        depends_on: deps,
        captures,
        notes,
        actual_status: null,
        actual_body: null,
        result: null,
        generated: true,
      };

      newTests.push(test);
      existingRoutes.set(key, testId); // prevent duplicates within this run

      if (!newGroupTests.has(prim.id)) newGroupTests.set(prim.id, []);
      newGroupTests.get(prim.id)!.push(testId);
    }
  }

  if (newTests.length === 0) {
    console.log("All live routes have test coverage.");
    process.exit(0);
  }

  if (CHECK_MODE) {
    console.log(`Missing ${newTests.length} test(s) for live routes:`);
    for (const t of newTests) {
      console.log(`  ${t.id}  ${t.method} ${t.endpoint}  ${t.test}`);
    }
    process.exit(1);
  }

  // ── Merge into plan ────────────────────────────────────────────────────

  // Add tests to the tests array
  plan.tests.push(...newTests);

  // Update or create groups
  for (const [primId, testIds] of newGroupTests) {
    const existingGroup = plan.groups.find((g) => g.id === primId);
    if (existingGroup) {
      // Add new test IDs to existing group
      for (const id of testIds) {
        if (!existingGroup.tests.includes(id)) {
          existingGroup.tests.push(id);
        }
      }
    } else {
      // Create new group
      const prim = prims.find((p) => p.id === primId)!;
      plan.groups.push({
        id: primId,
        name: `${prim.name.replace(".sh", "")} (${prim.name})`,
        prompt: `Test all ${prim.name} endpoints on ${prim.endpoint}.`,
        tests: testIds,
      });
    }
  }

  // Write
  const output = JSON.stringify(plan, null, 2) + "\n";
  writeFileSync(PLAN_PATH, output);

  console.log(`Generated ${newTests.length} new test(s):`);
  for (const t of newTests) {
    console.log(`  ${t.id}  ${t.method.padEnd(6)} ${t.endpoint}`);
    console.log(`         ${t.test}`);
  }
  console.log(`\nUpdated: ${PLAN_PATH}`);
}

main();
