#!/usr/bin/env bun
/**
 * gate-runner.ts — Deterministic smoke test runner for prim.sh
 *
 * Reads tests/smoke-test-plan.json, executes HTTP requests against live
 * endpoints, asserts on response status/shape, and reports results.
 *
 * Usage:
 *   bun scripts/gate-runner.ts                  # Run all groups
 *   bun scripts/gate-runner.ts --group store    # Run specific group
 *   bun scripts/gate-runner.ts --ci             # CI mode: exit 1 if live prim fails
 *   bun scripts/gate-runner.ts --dry-run        # Show what would be tested
 */

import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { createPrimFetch } from "../packages/x402-client/src/index.ts";
import { loadPrimitives } from "./lib/primitives.js";

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
  expected: {
    status: number;
    body?: Record<string, unknown>;
    body_equals?: string;
  };
  depends_on: string[];
  captures: Record<string, string>;
  notes: string | null;
  // Previous run data (ignored by runner)
  actual_status?: number | null;
  actual_body?: unknown;
  result?: string | null;
  run_note?: string | null;
}

interface TestResult {
  id: string;
  result: "pass" | "fail" | "blocked";
  actual_status: number | null;
  run_note: string | null;
}

interface GroupSummary {
  pass: number;
  fail: number;
  blocked: number;
}

interface RunResult {
  timestamp: string;
  mode: string;
  groups: Record<string, GroupSummary>;
  tests: TestResult[];
  summary: { total: number; pass: number; fail: number; blocked: number };
}

// ── ANSI Colors ────────────────────────────────────────────────────────────

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

// ── CLI Args ───────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    group: { type: "string", short: "g" },
    ci: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

// ── Paths ──────────────────────────────────────────────────────────────────

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PLAN_PATH = join(ROOT, "tests", "smoke-test-plan.json");
const RUNS_DIR = join(ROOT, "tests", "runs");

// ── JSON Path Resolver ─────────────────────────────────────────────────────

/**
 * Resolve a simple JSON path like "$.bucket.id" or "$.messages[0].id"
 * against a parsed JSON object.
 */
function resolveJsonPath(obj: unknown, path: string): string | undefined {
  if (!path.startsWith("$.")) return undefined;

  const segments = path
    .slice(2)
    .split(".")
    .flatMap((seg) => {
      // Handle array index notation: "array[0]" -> ["array", "0"]
      const match = seg.match(/^([^[]+)\[(\d+)\]$/);
      if (match) return [match[1], match[2]];
      return [seg];
    });

  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      const idx = Number.parseInt(seg, 10);
      if (Number.isNaN(idx)) return undefined;
      current = current[idx];
    } else {
      current = (current as Record<string, unknown>)[seg];
    }
  }

  return current !== null && current !== undefined ? String(current) : undefined;
}

// ── Template Substitution ──────────────────────────────────────────────────

function substitute(template: string, vars: Map<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars.get(key) ?? `{{${key}}}`);
}

function substituteInput(input: unknown, vars: Map<string, string>): unknown {
  if (typeof input === "string") return substitute(input, vars);
  if (Array.isArray(input)) return input.map((v) => substituteInput(v, vars));
  if (input !== null && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = substituteInput(v, vars);
    }
    return out;
  }
  return input;
}

// ── Shape Matching ─────────────────────────────────────────────────────────

/**
 * Check if `actual` matches the expected shape spec.
 * Returns null on match, or an error string on mismatch.
 */
function matchShape(actual: unknown, expected: unknown, path = "$"): string | null {
  if (expected === null || expected === undefined) return null;

  if (typeof expected === "string") {
    // Type-check strings
    switch (expected) {
      case "string":
        return typeof actual === "string" ? null : `${path}: expected string, got ${typeof actual}`;
      case "number":
        return typeof actual === "number" ? null : `${path}: expected number, got ${typeof actual}`;
      case "boolean":
        return typeof actual === "boolean"
          ? null
          : `${path}: expected boolean, got ${typeof actual}`;
      case "array":
        return Array.isArray(actual) ? null : `${path}: expected array, got ${typeof actual}`;
      case "array (non-empty)":
        if (!Array.isArray(actual)) return `${path}: expected array, got ${typeof actual}`;
        return actual.length > 0 ? null : `${path}: expected non-empty array, got empty`;
      default: {
        // "number >= N" pattern
        const geMatch = expected.match(/^number\s*>=\s*(\d+)$/);
        if (geMatch) {
          if (typeof actual !== "number")
            return `${path}: expected number, got ${typeof actual}`;
          const threshold = Number.parseInt(geMatch[1], 10);
          return actual >= threshold
            ? null
            : `${path}: expected >= ${threshold}, got ${actual}`;
        }
        // "non-empty string"
        if (expected === "non-empty string") {
          if (typeof actual !== "string")
            return `${path}: expected string, got ${typeof actual}`;
          return actual.length > 0 ? null : `${path}: expected non-empty string`;
        }
        // Template variable (e.g. "{{agent_address}}") — just check it's a string
        if (expected.startsWith("{{") && expected.endsWith("}}")) {
          return typeof actual === "string"
            ? null
            : `${path}: expected string (template), got ${typeof actual}`;
        }
        // Literal match
        return actual === expected
          ? null
          : `${path}: expected "${expected}", got ${JSON.stringify(actual)}`;
      }
    }
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${path}: expected array, got ${typeof actual}`;
    // Check shape of first expected element against first actual element
    if (expected.length > 0 && actual.length > 0) {
      return matchShape(actual[0], expected[0], `${path}[0]`);
    }
    return null;
  }

  if (typeof expected === "object" && expected !== null) {
    if (typeof actual !== "object" || actual === null)
      return `${path}: expected object, got ${typeof actual}`;
    for (const [key, expectedVal] of Object.entries(expected as Record<string, unknown>)) {
      const actualVal = (actual as Record<string, unknown>)[key];
      const err = matchShape(actualVal, expectedVal, `${path}.${key}`);
      if (err) return err;
    }
    return null;
  }

  // Primitive literal match
  return actual === expected
    ? null
    : `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
}

// ── Free Route Detection ───────────────────────────────────────────────────

function isFreeRoute(test: TestDef): boolean {
  if (test.method === "GET" && test.endpoint.match(/\/$/) && !test.endpoint.includes("/v1/"))
    return true;
  if (test.notes?.toLowerCase().includes("free")) return true;
  return false;
}

// ── Prim Status Lookup ─────────────────────────────────────────────────────

function buildPrimStatusMap(): Map<string, string> {
  const prims = loadPrimitives(ROOT);
  const map = new Map<string, string>();
  for (const p of prims) {
    map.set(p.name, p.status);
    if (p.endpoint) map.set(p.endpoint, p.status);
  }
  return map;
}

function getServiceStatus(service: string, statusMap: Map<string, string>): string {
  return statusMap.get(service) ?? "building";
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Load plan
  const planFile = Bun.file(PLAN_PATH);
  if (!(await planFile.exists())) {
    console.error(`Plan not found: ${PLAN_PATH}`);
    process.exit(1);
  }
  const plan: TestPlan = await planFile.json();

  // Build test index
  const testIndex = new Map<string, TestDef>();
  for (const t of plan.tests) {
    testIndex.set(t.id, t);
  }

  // Filter groups
  let groups = plan.groups;
  if (args.group) {
    groups = groups.filter((g) => g.id === args.group);
    if (groups.length === 0) {
      const available = plan.groups.map((g) => g.id).join(", ");
      console.error(`Unknown group: ${args.group}`);
      console.error(`Available: ${available}`);
      process.exit(1);
    }
  }

  // Ensure onboarding runs first if not filtering to a specific group
  if (!args.group) {
    const onboardingIdx = groups.findIndex((g) => g.id === "onboarding");
    if (onboardingIdx > 0) {
      const [onboarding] = groups.splice(onboardingIdx, 1);
      // Put onboarding right after discovery (index 1) or first if no discovery
      const discoveryIdx = groups.findIndex((g) => g.id === "discovery");
      if (discoveryIdx >= 0) {
        groups.splice(discoveryIdx + 1, 0, onboarding);
      } else {
        groups.unshift(onboarding);
      }
    }
  }

  // ── Dry Run ────────────────────────────────────────────────────────────

  if (args["dry-run"]) {
    console.log(`\n${c.bold("Gate Runner — Dry Run")}`);
    console.log(`Plan: ${plan.plan}`);
    console.log(`Network: ${plan.network}\n`);

    for (const group of groups) {
      const tests = group.tests
        .map((id) => testIndex.get(id))
        .filter((t): t is TestDef => t !== undefined);
      console.log(`${c.bold(`Group: ${group.id}`)} (${tests.length} tests)`);
      for (const t of tests) {
        const method = t.method.padEnd(6);
        console.log(`  ${c.dim(t.id.padEnd(8))} ${method} ${t.endpoint}  ${c.dim(t.test)}`);
      }
      console.log();
    }
    process.exit(0);
  }

  // ── Live Run Setup ─────────────────────────────────────────────────────

  console.log(`\n${c.bold("Gate Runner")}`);
  console.log(`Plan: ${plan.plan}`);
  console.log(`Network: ${plan.network}`);
  console.log(`Mode: ${args.ci ? "CI" : "local"}\n`);

  // Set up template variables
  const captureStore = new Map<string, string>();
  const timestamp = new Date().toISOString();
  const testPrefix = `gate-${Date.now()}`;
  captureStore.set("test_prefix", testPrefix);
  captureStore.set("runner", "gate-runner");

  // Agent address from env
  const agentAddress = process.env.AGENT_ADDRESS;
  if (agentAddress) {
    captureStore.set("agent_address", agentAddress);
  }

  // EIP-191 registration needs special handling — set placeholders
  // These require actual crypto signing, so we mark them as needing generation
  captureStore.set("iso_timestamp", new Date().toISOString());

  // Build primFetch for paid routes
  let primFetch: typeof fetch;
  try {
    primFetch = createPrimFetch({
      keystore: true,
      maxPayment: "1.00",
    });
  } catch {
    // Fall back to AGENT_PRIVATE_KEY env
    const pk = process.env.AGENT_PRIVATE_KEY;
    if (!pk) {
      console.error(
        c.red("No wallet available. Set AGENT_PRIVATE_KEY or configure keystore at ~/.prim/keys/"),
      );
      process.exit(1);
    }
    primFetch = createPrimFetch({
      privateKey: pk as `0x${string}`,
      maxPayment: "1.00",
    });
  }

  // Load prim status map for gating
  const primStatusMap = buildPrimStatusMap();

  // ── Execute Tests ──────────────────────────────────────────────────────

  const results: TestResult[] = [];
  const resultIndex = new Map<string, TestResult>();
  const groupSummaries: Record<string, GroupSummary> = {};

  for (const group of groups) {
    console.log(c.bold(`\n── ${group.name} (${group.id}) ──`));
    const summary: GroupSummary = { pass: 0, fail: 0, blocked: 0 };

    for (const testId of group.tests) {
      const testDef = testIndex.get(testId);
      if (!testDef) {
        console.log(`  ${c.yellow("?")} ${testId} — test not found in plan`);
        continue;
      }

      const result: TestResult = {
        id: testId,
        result: "fail",
        actual_status: null,
        run_note: null,
      };

      try {
        // Check dependencies
        const blockedBy = testDef.depends_on.find((depId) => {
          const depResult = resultIndex.get(depId);
          return !depResult || depResult.result !== "pass";
        });

        if (blockedBy) {
          result.result = "blocked";
          result.run_note = `blocked by ${blockedBy}`;
          summary.blocked++;
          console.log(
            `  ${c.yellow("○")} ${testId.padEnd(8)} ${c.yellow("blocked")}  ${c.dim(`(by ${blockedBy})`)}`,
          );
          results.push(result);
          resultIndex.set(testId, result);
          continue;
        }

        // Substitute template variables in endpoint and input
        const endpoint = substitute(testDef.endpoint, captureStore);
        const input = substituteInput(testDef.input, captureStore);

        // Check for unresolved template variables
        if (endpoint.includes("{{")) {
          result.result = "blocked";
          result.run_note = `unresolved template in endpoint: ${endpoint}`;
          summary.blocked++;
          console.log(
            `  ${c.yellow("○")} ${testId.padEnd(8)} ${c.yellow("blocked")}  ${c.dim(result.run_note)}`,
          );
          results.push(result);
          resultIndex.set(testId, result);
          continue;
        }

        // Build request
        const fetchFn = isFreeRoute(testDef) ? fetch : primFetch;
        const fetchInit: RequestInit = { method: testDef.method };

        if (testDef.method === "POST" || testDef.method === "PUT") {
          if (typeof input === "string") {
            // Raw string body (e.g. file upload)
            fetchInit.body = input;
            fetchInit.headers = { "Content-Type": "text/plain" };
          } else if (input !== null && input !== undefined) {
            fetchInit.body = JSON.stringify(input);
            fetchInit.headers = { "Content-Type": "application/json" };
          }
        }

        // Execute
        const response = await fetchFn(endpoint, fetchInit);
        result.actual_status = response.status;

        // Special cases: 409 on wallet registration = pass, 429 on faucet = pass
        const isWalletReg409 =
          testId === "W-1" && response.status === 409;
        const isFaucetRateLimit =
          (testId === "F-1" || testId === "F-2") && response.status === 429;

        if (isWalletReg409 || isFaucetRateLimit) {
          result.result = "pass";
          result.run_note = isWalletReg409
            ? "409 already registered (counts as pass)"
            : "429 rate limited (counts as pass)";
          summary.pass++;

          console.log(
            `  ${c.green("●")} ${testId.padEnd(8)} ${c.green("pass")}    ${response.status} ${c.dim(result.run_note)}`,
          );
          results.push(result);
          resultIndex.set(testId, result);
          continue;
        }

        // Check status
        const statusMatch = response.status === testDef.expected.status;

        // Parse response body
        let responseBody: unknown = null;
        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          try {
            responseBody = await response.json();
          } catch {
            responseBody = null;
          }
        } else if (
          testDef.expected.body_equals !== undefined ||
          contentType.includes("text/")
        ) {
          try {
            responseBody = await response.text();
          } catch {
            responseBody = null;
          }
        } else {
          // Consume body to free resources
          await response.arrayBuffer().catch(() => {});
        }

        // Check body_equals (exact string match)
        if (statusMatch && testDef.expected.body_equals !== undefined) {
          const expectedText = substitute(testDef.expected.body_equals, captureStore);
          if (responseBody === expectedText) {
            result.result = "pass";
          } else {
            result.result = "fail";
            const truncatedActual =
              typeof responseBody === "string"
                ? responseBody.slice(0, 200)
                : JSON.stringify(responseBody)?.slice(0, 200);
            result.run_note = `body mismatch: expected "${expectedText}", got "${truncatedActual}"`;
          }
        }
        // Check body shape
        else if (statusMatch && testDef.expected.body) {
          const shapeErr = matchShape(responseBody, testDef.expected.body);
          if (shapeErr) {
            result.result = "fail";
            result.run_note = `shape mismatch: ${shapeErr}`;
          } else {
            result.result = "pass";
          }
        }
        // Status-only check
        else if (statusMatch) {
          result.result = "pass";
        } else {
          result.result = "fail";
          const bodyPreview =
            typeof responseBody === "string"
              ? responseBody.slice(0, 200)
              : JSON.stringify(responseBody)?.slice(0, 200) ?? "";
          result.run_note = `expected ${testDef.expected.status}, got ${response.status}. Body: ${bodyPreview}`;
        }

        // Process captures on success
        if (
          result.result === "pass" &&
          testDef.captures &&
          Object.keys(testDef.captures).length > 0
        ) {
          for (const [varName, jsonPath] of Object.entries(testDef.captures)) {
            const captured = resolveJsonPath(responseBody, jsonPath);
            if (captured !== undefined) {
              captureStore.set(varName, captured);
            }
          }
        }

        // Log
        if (result.result === "pass") {
          summary.pass++;
          console.log(
            `  ${c.green("●")} ${testId.padEnd(8)} ${c.green("pass")}    ${response.status}`,
          );
        } else {
          summary.fail++;
          console.log(
            `  ${c.red("✗")} ${testId.padEnd(8)} ${c.red("fail")}    ${response.status}  ${c.dim(result.run_note ?? "")}`,
          );
        }
      } catch (err) {
        result.result = "fail";
        result.run_note = err instanceof Error ? err.message : String(err);
        summary.fail++;
        console.log(
          `  ${c.red("✗")} ${testId.padEnd(8)} ${c.red("fail")}    ${c.dim(`error: ${result.run_note}`)}`,
        );
      }

      results.push(result);
      resultIndex.set(testId, result);
    }

    groupSummaries[group.id] = summary;
  }

  // ── Summary ────────────────────────────────────────────────────────────

  const total = results.length;
  const pass = results.filter((r) => r.result === "pass").length;
  const fail = results.filter((r) => r.result === "fail").length;
  const blocked = results.filter((r) => r.result === "blocked").length;

  console.log(`\n${c.bold("Gate Runner Results")}`);
  console.log("═══════════════════");

  for (const group of groups) {
    const s = groupSummaries[group.id];
    if (!s) continue;
    const groupTotal = s.pass + s.fail + s.blocked;
    let extra = "";
    if (s.fail > 0) extra += `  (${s.fail} fail`;
    if (s.blocked > 0) extra += extra ? `, ${s.blocked} blocked)` : `  (${s.blocked} blocked)`;
    else if (extra) extra += ")";

    const status =
      s.fail > 0
        ? c.red(`${s.pass}/${groupTotal}`)
        : s.blocked > 0
          ? c.yellow(`${s.pass}/${groupTotal}`)
          : c.green(`${s.pass}/${groupTotal}`);

    console.log(`${group.id.padEnd(14)} ${status}  pass${extra}`);
  }

  console.log("─────────────────");
  const summaryColor = fail > 0 ? c.red : blocked > 0 ? c.yellow : c.green;
  let summaryExtra = "";
  if (fail > 0) summaryExtra += `${fail} fail`;
  if (blocked > 0) summaryExtra += summaryExtra ? `, ${blocked} blocked` : `${blocked} blocked`;
  console.log(
    `${"Total".padEnd(14)} ${summaryColor(`${pass}/${total}`)}  ${summaryExtra ? `(${summaryExtra})` : ""}\n`,
  );

  // ── Write Results ──────────────────────────────────────────────────────

  if (!existsSync(RUNS_DIR)) {
    mkdirSync(RUNS_DIR, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const resultPath = join(RUNS_DIR, `${dateStr}-gate.json`);

  const runResult: RunResult = {
    timestamp,
    mode: args.ci ? "ci" : "local",
    groups: groupSummaries,
    tests: results,
    summary: { total, pass, fail, blocked },
  };

  await Bun.write(resultPath, JSON.stringify(runResult, null, 2) + "\n");
  console.log(`Results: ${resultPath}`);

  // ── CI Gating ──────────────────────────────────────────────────────────

  if (args.ci) {
    // Check if any "live" prim has failures
    let liveFailure = false;

    for (const r of results) {
      if (r.result !== "fail") continue;
      const testDef = testIndex.get(r.id);
      if (!testDef) continue;

      const status = getServiceStatus(testDef.service, primStatusMap);
      if (status === "live") {
        liveFailure = true;
        console.log(c.red(`CI FAIL: ${r.id} (${testDef.service}) is live and failed`));
      } else {
        // building or testing — warn only
        console.log(
          c.yellow(`CI WARN: ${r.id} (${testDef.service}) is ${status} — failure is non-blocking`),
        );
      }
    }

    if (liveFailure) {
      console.log(c.red("\nCI gate FAILED — live primitive(s) have test failures\n"));
      process.exit(1);
    }

    console.log(c.green("\nCI gate PASSED\n"));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("\nFatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
