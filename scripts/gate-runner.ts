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
 *   bun scripts/gate-runner.ts --canary         # Agent canary mode
 *   bun scripts/gate-runner.ts --canary --group infer  # Canary for one group
 *   bun scripts/gate-runner.ts --dry-run --canary      # Dry-run canary
 */

import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { createPrimFetch } from "../packages/x402-client/src/index.ts";
import { loadPrimitives } from "./lib/primitives.js";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";

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
  skip?: boolean;
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

// ── Canary Types ────────────────────────────────────────────────────────────

interface CanaryToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface CanaryStepResult {
  tool_call_id: string;
  method: string;
  url: string;
  status: number | null;
  ok: boolean;
  note: string | null;
  request_body: unknown;
  response_body: unknown;
}

interface CanaryGroupResult {
  group_id: string;
  group_name: string;
  verdict: "pass" | "warn" | "fail" | "error";
  steps: CanaryStepResult[];
  ux_notes: string[];
  agent_summary: string | null;
  error: string | null;
}

interface CanaryRunResult {
  timestamp: string;
  mode: "canary";
  network: string;
  groups: CanaryGroupResult[];
  summary: {
    total_groups: number;
    pass: number;
    warn: number;
    fail: number;
    error: number;
  };
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
    canary: { type: "boolean", default: false },
  },
  strict: true,
});

// ── Paths ──────────────────────────────────────────────────────────────────

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PLAN_PATH = join(ROOT, "tests", "smoke-test-plan.json");
const RUNS_DIR = join(ROOT, "tests", "runs");
const SITE_DIR = join(ROOT, "site");

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

// ── Canary Helpers ─────────────────────────────────────────────────────────

/**
 * Determine which prim IDs are covered by a group.
 * Extracts unique service names from the group's tests and strips ".sh".
 */
function getGroupPrimIds(group: GroupDef, testIndex: Map<string, TestDef>): string[] {
  const services = new Set<string>();
  for (const testId of group.tests) {
    const t = testIndex.get(testId);
    if (t?.service) services.add(t.service.replace(/\.sh$/, ""));
  }
  return Array.from(services);
}

/**
 * Load llms.txt content for a prim from site/<prim>/llms.txt.
 * Returns null if not found.
 */
async function loadLlmsTxt(primId: string): Promise<string | null> {
  const llmsPath = join(SITE_DIR, primId, "llms.txt");
  if (!existsSync(llmsPath)) return null;
  const f = Bun.file(llmsPath);
  return await f.text();
}

/**
 * Load the root site/llms.txt (platform overview).
 */
async function loadRootLlmsTxt(): Promise<string | null> {
  const llmsPath = join(SITE_DIR, "llms.txt");
  if (!existsSync(llmsPath)) return null;
  const f = Bun.file(llmsPath);
  return await f.text();
}

/**
 * Build the canary prompt for a group using the template.
 */
function buildCanaryPrompt(
  groupPrompt: string,
  serviceName: string,
  endpoint: string,
  llmsTxt: string,
): string {
  return `You are testing ${serviceName} (${endpoint}).

Read the API documentation below, then complete the following tasks:
${groupPrompt}

For each task:
1. Decide which API call to make based on the docs
2. Make the call using the http_request tool (you have a funded wallet — x402 payments are handled automatically)
3. If a call fails, try once more with a corrected request. If it fails again, report the failure and move to the next task. Do NOT retry the same endpoint more than twice.
4. Report: did it work? was anything confusing?

When you have completed all tasks, provide a final structured report with:
- Which steps worked and which failed
- Any UX observations (confusing error messages, unclear docs, missing info, broken workflows)
- Overall assessment

## API Documentation
${llmsTxt}`;
}

/**
 * Tool definitions for the canary agent.
 * The agent calls these to make HTTP requests; gate runner executes them.
 */
const CANARY_TOOLS = [
  {
    type: "function",
    function: {
      name: "http_request",
      description: "Make an HTTP request to a prim.sh API endpoint. x402 payments are handled automatically.",
      parameters: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            description: "HTTP method",
          },
          url: {
            type: "string",
            description: "Full URL to request (e.g. https://store.prim.sh/v1/buckets)",
          },
          body: {
            type: "object",
            description: "Request body for POST/PUT/PATCH. Omit for GET/DELETE.",
          },
          headers: {
            type: "object",
            description: "Additional request headers (optional).",
            additionalProperties: { type: "string" },
          },
        },
        required: ["method", "url"],
      },
    },
  },
];

/**
 * Execute a single tool call from the agent.
 * Returns the HTTP response as a structured object.
 */
async function executeToolCall(
  toolCall: CanaryToolCall,
  primFetch: typeof fetch,
): Promise<{ status: number; body: unknown; ok: boolean }> {
  const { method, url, body, headers: extraHeaders } = toolCall.arguments as {
    method: string;
    url: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  };

  const fetchInit: RequestInit = { method };
  const reqHeaders: Record<string, string> = { ...(extraHeaders ?? {}) };

  if (body !== undefined && (method === "POST" || method === "PUT" || method === "PATCH")) {
    fetchInit.body = JSON.stringify(body);
    reqHeaders["Content-Type"] = "application/json";
  }

  if (Object.keys(reqHeaders).length > 0) {
    fetchInit.headers = reqHeaders;
  }

  const response = await primFetch(url, fetchInit);
  const contentType = response.headers.get("content-type") ?? "";
  let responseBody: unknown = null;

  try {
    if (contentType.includes("application/json")) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }
  } catch {
    // Body parse failure — not critical
  }

  return {
    status: response.status,
    body: responseBody,
    ok: response.ok,
  };
}

/**
 * Run a multi-turn agent loop for one group.
 *
 * 1. Send system prompt + user message (group prompt + llms.txt) to infer.sh
 * 2. If agent calls tools, execute them and send results back
 * 3. Repeat until agent stops or max rounds reached
 * 4. Parse final message for structured results
 */
async function runCanaryGroup(
  group: GroupDef,
  testIndex: Map<string, TestDef>,
  primFetch: typeof fetch,
  inferEndpoint: string,
): Promise<CanaryGroupResult> {
  const primIds = getGroupPrimIds(group, testIndex);

  // Gather llms.txt content — use group-specific if single prim, else root
  let llmsTxt: string | null = null;
  if (primIds.length === 1) {
    llmsTxt = await loadLlmsTxt(primIds[0]);
  }
  if (!llmsTxt) {
    // Multi-prim group or missing per-prim llms.txt — fall back to root
    llmsTxt = await loadRootLlmsTxt();
  }
  if (!llmsTxt) {
    llmsTxt = "(API documentation not found. Proceed based on your knowledge of the service.)";
  }

  // Determine service display name and endpoint from first prim
  const firstPrimId = primIds[0] ?? group.id;
  const serviceName = `${firstPrimId}.sh`;
  const endpoint = `${firstPrimId}.prim.sh`;

  const promptText = buildCanaryPrompt(group.prompt, serviceName, endpoint, llmsTxt);

  // OpenAI-compatible messages
  type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: "You are an API tester for prim.sh. Use the http_request tool to make API calls. Be concise and structured in your final report.",
    },
    {
      role: "user",
      content: promptText,
    },
  ];

  const steps: CanaryStepResult[] = [];
  const uxNotes: string[] = [];
  let agentSummary: string | null = null;
  const MAX_ROUNDS = 10;
  const failCounts = new Map<string, number>(); // "METHOD url" → consecutive fail count
  const MAX_RETRIES_PER_ENDPOINT = 2;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Call infer.sh /v1/chat
    const chatRequest = {
      model: process.env.CANARY_MODEL ?? "anthropic/claude-sonnet-4-5",
      messages,
      tools: CANARY_TOOLS,
      tool_choice: "auto",
      max_tokens: 2048,
      temperature: 0.1,
    };

    const inferResponse = await primFetch(`${inferEndpoint}/v1/chat`, {
      method: "POST",
      body: JSON.stringify(chatRequest),
      headers: { "Content-Type": "application/json" },
    });

    if (!inferResponse.ok) {
      const errBody = await inferResponse.text().catch(() => "(unreadable)");
      return {
        group_id: group.id,
        group_name: group.name,
        verdict: "error",
        steps,
        ux_notes: uxNotes,
        agent_summary: null,
        error: `infer.sh returned ${inferResponse.status}: ${errBody.slice(0, 200)}`,
      };
    }

    const chatResponse = await inferResponse.json() as {
      choices: Array<{
        message: {
          role: string;
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
    };

    const choice = chatResponse.choices?.[0];
    if (!choice) {
      return {
        group_id: group.id,
        group_name: group.name,
        verdict: "error",
        steps,
        ux_notes: uxNotes,
        agent_summary: null,
        error: "infer.sh returned no choices",
      };
    }

    const assistantMsg = choice.message;

    // Add assistant message to conversation
    messages.push({
      role: "assistant",
      content: assistantMsg.content ?? null,
      tool_calls: assistantMsg.tool_calls?.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: tc.function,
      })),
    });

    // If no tool calls, agent is done
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      agentSummary = assistantMsg.content ?? null;
      break;
    }

    // Execute each tool call
    const toolResults: ChatMessage[] = [];

    for (const tc of assistantMsg.tool_calls) {
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }

      const toolCall: CanaryToolCall = {
        id: tc.id,
        name: tc.function.name,
        arguments: parsedArgs,
      };

      const method = String(parsedArgs.method ?? "GET");
      const url = String(parsedArgs.url ?? "");
      const reqBody = parsedArgs.body ?? null;
      const endpointKey = `${method} ${url}`;
      let stepResult: CanaryStepResult;

      // Check retry limit — if this endpoint already failed MAX_RETRIES_PER_ENDPOINT times, skip
      const priorFails = failCounts.get(endpointKey) ?? 0;
      if (priorFails >= MAX_RETRIES_PER_ENDPOINT) {
        stepResult = {
          tool_call_id: tc.id,
          method,
          url,
          status: null,
          ok: false,
          note: `skipped: failed ${priorFails} times already`,
          request_body: reqBody,
          response_body: null,
        };
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({
            error: `This endpoint has failed ${priorFails} times. Stop retrying and move to the next task.`,
          }),
        });
        steps.push(stepResult);
        continue;
      }

      try {
        const result = await executeToolCall(toolCall, primFetch);
        stepResult = {
          tool_call_id: tc.id,
          method,
          url,
          status: result.status,
          ok: result.ok,
          note: null,
          request_body: reqBody,
          response_body: result.body,
        };

        if (!result.ok) {
          failCounts.set(endpointKey, priorFails + 1);
        } else {
          failCounts.set(endpointKey, 0); // reset on success
        }

        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ status: result.status, body: result.body }),
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        failCounts.set(endpointKey, priorFails + 1);
        stepResult = {
          tool_call_id: tc.id,
          method,
          url,
          status: null,
          ok: false,
          note: `request failed: ${errMsg}`,
          request_body: reqBody,
          response_body: null,
        };

        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: errMsg }),
        });
      }

      steps.push(stepResult);
    }

    // Add tool results to conversation
    for (const tr of toolResults) {
      messages.push(tr);
    }

    // If finish_reason is "stop" (no tool calls to process), we're done
    if (choice.finish_reason === "stop") {
      agentSummary = assistantMsg.content ?? null;
      break;
    }
  }

  // Extract UX notes from agent summary
  if (agentSummary) {
    // Look for lines that mention confusion, issues, or observations
    const notePatterns = [
      /ux[:\s]+(.+)/gi,
      /observation[s]?[:\s]+(.+)/gi,
      /confus(?:ing|ed)[:\s]+(.+)/gi,
      /unclear[:\s]+(.+)/gi,
      /issue[s]?[:\s]+(.+)/gi,
      /note[s]?[:\s]+(.+)/gi,
    ];

    for (const pattern of notePatterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(agentSummary)) !== null) {
        const note = match[1].trim();
        if (note.length > 10 && !uxNotes.includes(note)) {
          uxNotes.push(note);
        }
      }
    }
  }

  // Determine verdict
  const totalSteps = steps.length;
  const failedSteps = steps.filter((s) => !s.ok && s.status !== null).length;
  const errorSteps = steps.filter((s) => s.status === null).length;

  let verdict: CanaryGroupResult["verdict"];
  if (totalSteps === 0) {
    verdict = "warn"; // Agent made no calls — something went wrong
  } else if (errorSteps > 0) {
    verdict = "error";
  } else if (failedSteps === 0) {
    verdict = "pass";
  } else if (failedSteps < totalSteps) {
    verdict = "warn";
  } else {
    verdict = "fail";
  }

  return {
    group_id: group.id,
    group_name: group.name,
    verdict,
    steps,
    ux_notes: uxNotes,
    agent_summary: agentSummary,
    error: null,
  };
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
    if (args.canary) {
      console.log(`\n${c.bold("Gate Runner — Canary Dry Run")}`);
      console.log(`Plan: ${plan.plan}`);
      console.log(`Network: ${plan.network}`);
      console.log(`Mode: ${c.cyan("canary")} — agent drives LLM inference via infer.prim.sh\n`);

      for (const group of groups) {
        const primIds = getGroupPrimIds(group, testIndex);
        const llmsPath = primIds.length === 1
          ? `site/${primIds[0]}/llms.txt`
          : "site/llms.txt (multi-prim fallback)";
        console.log(`${c.bold(`Group: ${group.id}`)} (${group.name})`);
        console.log(`  ${c.dim("prims:")}     ${primIds.join(", ")}`);
        console.log(`  ${c.dim("llms.txt:")}  ${llmsPath}`);
        console.log(`  ${c.dim("prompt:")}    ${group.prompt.slice(0, 100)}…`);
        console.log();
      }
    } else {
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
    }
    process.exit(0);
  }

  // ── Live Run Setup ─────────────────────────────────────────────────────

  // Build primFetch for paid routes (used in both deterministic and canary)
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

  // ── Canary Mode ────────────────────────────────────────────────────────

  if (args.canary) {
    const inferEndpoint = process.env.INFER_ENDPOINT ?? "https://infer.prim.sh";
    const timestamp = new Date().toISOString();

    console.log(`\n${c.bold("Gate Runner — Canary Mode")}`);
    console.log(`Plan: ${plan.plan}`);
    console.log(`Network: ${plan.network}`);
    console.log(`Infer: ${inferEndpoint}`);
    console.log(`Mode: ${args.ci ? "CI" : "local"}\n`);

    const canaryResults: CanaryGroupResult[] = [];

    for (const group of groups) {
      console.log(c.bold(`\n── ${group.name} (${group.id}) ──`));
      console.log(c.dim("  Running agent canary…"));

      let result: CanaryGroupResult;
      try {
        result = await runCanaryGroup(group, testIndex, primFetch, inferEndpoint);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        result = {
          group_id: group.id,
          group_name: group.name,
          verdict: "error",
          steps: [],
          ux_notes: [],
          agent_summary: null,
          error: errMsg,
        };
      }

      canaryResults.push(result);

      // Print step results
      for (const step of result.steps) {
        const statusStr = step.status !== null ? String(step.status) : "err";
        const icon = step.ok ? c.green("●") : c.red("✗");
        const note = step.note ? c.dim(` (${step.note})`) : "";
        console.log(`  ${icon} ${step.method.padEnd(6)} ${step.url}  ${statusStr}${note}`);
      }

      // Print verdict
      const verdictStr =
        result.verdict === "pass"
          ? c.green("pass")
          : result.verdict === "warn"
            ? c.yellow("warn")
            : result.verdict === "error"
              ? c.yellow("error")
              : c.red("fail");

      console.log(`  ${c.bold("verdict:")} ${verdictStr}`);

      if (result.error) {
        console.log(`  ${c.red("error:")} ${result.error}`);
      }

      if (result.ux_notes.length > 0) {
        console.log(`  ${c.dim("UX notes:")}`);
        for (const note of result.ux_notes) {
          console.log(`    ${c.dim("·")} ${note}`);
        }
      }

      if (result.agent_summary) {
        const summary = result.agent_summary.slice(0, 300);
        const truncated = result.agent_summary.length > 300 ? "…" : "";
        console.log(`  ${c.dim("summary:")} ${summary}${truncated}`);
      }
    }

    // ── Canary Summary ────────────────────────────────────────────────

    const totalGroups = canaryResults.length;
    const passCount = canaryResults.filter((r) => r.verdict === "pass").length;
    const warnCount = canaryResults.filter((r) => r.verdict === "warn").length;
    const failCount = canaryResults.filter((r) => r.verdict === "fail").length;
    const errorCount = canaryResults.filter((r) => r.verdict === "error").length;

    console.log(`\n${c.bold("Canary Results")}`);
    console.log("═══════════════════");

    for (const r of canaryResults) {
      const verdictStr =
        r.verdict === "pass"
          ? c.green("pass")
          : r.verdict === "warn"
            ? c.yellow("warn")
            : r.verdict === "error"
              ? c.yellow("error")
              : c.red("fail");
      const stepsStr = `${r.steps.filter((s) => s.ok).length}/${r.steps.length} steps ok`;
      console.log(`${r.group_id.padEnd(14)} ${verdictStr}  ${c.dim(stepsStr)}`);
    }

    console.log("─────────────────");
    const overallColor = failCount > 0 || errorCount > 0 ? c.red : warnCount > 0 ? c.yellow : c.green;
    let summaryExtra = "";
    if (failCount > 0) summaryExtra += `${failCount} fail`;
    if (warnCount > 0) summaryExtra += summaryExtra ? `, ${warnCount} warn` : `${warnCount} warn`;
    if (errorCount > 0) summaryExtra += summaryExtra ? `, ${errorCount} error` : `${errorCount} error`;
    console.log(
      `${"Total".padEnd(14)} ${overallColor(`${passCount}/${totalGroups}`)} groups  ${summaryExtra ? `(${summaryExtra})` : ""}\n`,
    );

    // ── Write Canary Results ──────────────────────────────────────────

    if (!existsSync(RUNS_DIR)) {
      mkdirSync(RUNS_DIR, { recursive: true });
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const resultPath = join(RUNS_DIR, `${dateStr}-canary.json`);

    const canaryRunResult: CanaryRunResult = {
      timestamp,
      mode: "canary",
      network: plan.network,
      groups: canaryResults,
      summary: {
        total_groups: totalGroups,
        pass: passCount,
        warn: warnCount,
        fail: failCount,
        error: errorCount,
      },
    };

    await Bun.write(resultPath, JSON.stringify(canaryRunResult, null, 2) + "\n");
    console.log(`Results: ${resultPath}`);

    // ── CI Gating (canary) ────────────────────────────────────────────

    if (args.ci && failCount > 0) {
      console.log(c.red("\nCI canary FAILED — one or more groups failed\n"));
      process.exit(1);
    }

    process.exit(0);
  }

  // ── Deterministic Live Run ─────────────────────────────────────────────

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

  // Agent wallet — derive address from private key and pre-sign EIP-191 registration
  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
  const agentAddressEnv = process.env.AGENT_ADDRESS;
  const isoTimestamp = new Date().toISOString();
  captureStore.set("iso_timestamp", isoTimestamp);

  if (agentPrivateKey) {
    const account = privateKeyToAccount(agentPrivateKey);
    const address = getAddress(account.address);
    captureStore.set("agent_address", address);
    const regMessage = `Register ${address} with prim.sh at ${isoTimestamp}`;
    const eip191Sig = await account.signMessage({ message: regMessage });
    captureStore.set("eip191_sig", eip191Sig);
  } else if (agentAddressEnv) {
    captureStore.set("agent_address", agentAddressEnv);
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

      // Skip tests marked as skip in the test plan
      if (testDef.skip) {
        result.result = "pass";
        result.run_note = "skipped (marked skip in test plan)";
        summary.pass++;
        console.log(
          `  ${c.green("●")} ${testId.padEnd(8)} ${c.green("pass")}    ${c.dim("skipped")}`,
        );
        results.push(result);
        resultIndex.set(testId, result);
        continue;
      }

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
