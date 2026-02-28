#!/usr/bin/env bun
/**
 * gen-openai.ts — OpenAI function schema generator
 *
 * Reads OpenAPI specs from specs/openapi/*.yaml and outputs OpenAI-compatible
 * tool definitions (function calling format) to packages/openai/.
 *
 * Output:
 *   packages/openai/<id>.json      — per-prim tool array
 *   packages/openai/all.json       — all tools combined
 *   packages/openai/manifest.json  — metadata (version, prim list, timestamp)
 *
 * Usage:
 *   bun scripts/gen-openai.ts          # generate
 *   bun scripts/gen-openai.ts --check  # diff against disk, exit 1 if stale
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { primsForInterface } from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");
const SPECS_DIR = join(ROOT, "specs", "openapi");
const OUTPUT_DIR = join(ROOT, "packages", "openai");
const CHECK_MODE = process.argv.includes("--check");

let anyFailed = false;

// ── Types ──────────────────────────────────────────────────────────────────

interface OpenApiProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  format?: string;
  items?: OpenApiProperty;
  properties?: Record<string, OpenApiProperty>;
  required?: string[];
  oneOf?: OpenApiProperty[];
  $ref?: string;
  additionalProperties?: boolean | OpenApiProperty;
  pattern?: string;
}

interface OpenApiSchema extends OpenApiProperty {
  required?: string[];
}

interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: OpenApiProperty;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  "x-price"?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: OpenApiSchema }>;
  };
}

interface OpenApiSpec {
  info: { title: string; version: string };
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
}

interface OpenAiFunction {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// ── operationId → tool name mapping ────────────────────────────────────────
//
// These match the MCP tool names exactly (from packages/mcp/src/tools/).
// Grouped by prim. healthCheck and free-only ops (getLlmsTxt, llmsTxt) are excluded.

const OPERATION_ID_TO_TOOL_NAME: Record<string, string> = {
  // search
  searchWeb: "search_web",
  searchNews: "search_news",
  extractUrls: "search_extract",
  // store
  createBucket: "store_bucket_create",
  listBuckets: "store_bucket_list",
  getBucket: "store_bucket_get",
  deleteBucket: "store_bucket_delete",
  listObjects: "store_object_list",
  putObject: "store_object_put",
  getObject: "store_object_get",
  deleteObject: "store_object_delete",
  getQuota: "store_quota_get",
  setQuota: "store_quota_set",
  reconcileQuota: "store_quota_reconcile",
  // wallet
  registerWallet: "wallet_register",
  listWallets: "wallet_list",
  getWallet: "wallet_get",
  deactivateWallet: "wallet_deactivate",
  createFundRequest: "wallet_fund_request_create",
  listFundRequests: "wallet_fund_request_list",
  approveFundRequest: "wallet_fund_request_approve",
  denyFundRequest: "wallet_fund_request_deny",
  getPolicy: "wallet_policy_get",
  updatePolicy: "wallet_policy_update",
  pauseWallet: "wallet_pause",
  resumeWallet: "wallet_resume",
  // email
  createMailbox: "email_mailbox_create",
  listMailboxes: "email_mailbox_list",
  getMailbox: "email_mailbox_get",
  deleteMailbox: "email_mailbox_delete",
  renewMailbox: "email_mailbox_renew",
  listMessages: "email_messages_list",
  getMessage: "email_message_get",
  sendMessage: "email_send",
  registerWebhook: "email_webhook_create",
  listWebhooks: "email_webhook_list",
  deleteWebhook: "email_webhook_delete",
  registerDomain: "email_domain_register",
  listDomains: "email_domain_list",
  getDomain: "email_domain_get",
  deleteDomain: "email_domain_delete",
  verifyDomain: "email_domain_verify",
  // spawn
  createServer: "spawn_server_create",
  listServers: "spawn_server_list",
  getServer: "spawn_server_get",
  deleteServer: "spawn_server_delete",
  startServer: "spawn_server_start",
  stopServer: "spawn_server_stop",
  rebootServer: "spawn_server_reboot",
  resizeServer: "spawn_server_resize",
  rebuildServer: "spawn_server_rebuild",
  createSshKey: "spawn_ssh_key_create",
  listSshKeys: "spawn_ssh_key_list",
  deleteSshKey: "spawn_ssh_key_delete",
  // mem
  createCollection: "mem_collection_create",
  listCollections: "mem_collection_list",
  getCollection: "mem_collection_get",
  deleteCollection: "mem_collection_delete",
  upsertDocuments: "mem_upsert",
  queryCollection: "mem_query",
  setCache: "mem_cache_put",
  getCache: "mem_cache_get",
  deleteCache: "mem_cache_delete",
  // token
  deployToken: "token_deploy",
  listTokens: "token_list",
  getToken: "token_get",
  mintTokens: "token_mint",
  getTokenSupply: "token_supply",
  createPool: "token_pool_create",
  getPool: "token_pool_get",
  getLiquidityParams: "token_pool_liquidity_params",
  // domain
  searchDomains: "domain_search",
  quoteDomain: "domain_quote",
  // domain.yaml also has registerDomain — disambiguated below per-spec
  recoverRegistration: "domain_recover",
  getDomainStatus: "domain_status",
  configureNs: "domain_configure_ns",
  createZone: "domain_zone_create",
  listZones: "domain_zone_list",
  getZone: "domain_zone_get",
  deleteZone: "domain_zone_delete",
  activateZone: "domain_zone_activate",
  verifyZone: "domain_zone_verify",
  setupMail: "domain_zone_mail_setup",
  batchRecords: "domain_record_batch",
  createRecord: "domain_record_create",
  listRecords: "domain_record_list",
  getRecord: "domain_record_get",
  updateRecord: "domain_record_update",
  deleteRecord: "domain_record_delete",
  // faucet
  dripUsdc: "faucet_usdc",
  dripEth: "faucet_eth",
  getFaucetStatus: "faucet_status",
};

// Per-spec overrides: operationId collisions across specs (e.g. registerDomain)
const SPEC_OPERATION_OVERRIDES: Record<string, Record<string, string>> = {
  domain: {
    registerDomain: "domain_register",
  },
};

// Operations to skip (free/health endpoints with no meaningful parameters)
const SKIP_OPERATIONS = new Set(["healthCheck", "getLlmsTxt", "llmsTxt"]);

// ── Schema resolution ──────────────────────────────────────────────────────

function resolveRef(spec: OpenApiSpec, ref: string): OpenApiProperty | null {
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  // biome-ignore lint/suspicious/noExplicitAny: dynamic typing required
  let obj: any = spec;
  for (const part of parts) {
    if (obj == null || typeof obj !== "object") return null;
    obj = obj[part];
  }
  return obj as OpenApiProperty;
}

function resolveProperty(spec: OpenApiSpec, prop: OpenApiProperty): OpenApiProperty {
  if (prop.$ref) {
    const resolved = resolveRef(spec, prop.$ref);
    return resolved ? resolved : prop;
  }
  return prop;
}

// Convert an OpenAPI property to an OpenAI-compatible JSON Schema property.
// Returns a clean object without unsupported fields.
function convertProperty(
  spec: OpenApiSpec,
  prop: OpenApiProperty,
  topLevel = false,
): Record<string, unknown> {
  const resolved = resolveProperty(spec, prop);

  // Handle oneOf: pick the most useful variant (prefer array over string for urls-style fields)
  if (resolved.oneOf) {
    const arrayVariant = resolved.oneOf.find((v) => v.type === "array");
    const candidate = arrayVariant ?? resolved.oneOf[0];
    if (candidate) {
      const converted = convertProperty(spec, candidate);
      if (resolved.description) converted.description = resolved.description;
      return converted;
    }
  }

  const out: Record<string, unknown> = {};

  // Type — normalize array types (OpenAPI 3.1 allows ["string", "null"]) to single type
  if (resolved.type) {
    if (Array.isArray(resolved.type)) {
      // Filter out "null" to get the primary type
      const nonNull = resolved.type.filter((t) => t !== "null");
      out.type = nonNull.length === 1 ? nonNull[0] : nonNull;
    } else {
      out.type = resolved.type;
    }
  }

  // Description — incorporate default value inline
  let desc = resolved.description ?? "";
  desc = desc.trim();
  if (resolved.default !== undefined) {
    const defaultStr = JSON.stringify(resolved.default);
    if (!desc.toLowerCase().includes("default")) {
      desc = desc ? `${desc} (default: ${defaultStr})` : `Default: ${defaultStr}`;
    }
  }
  if (desc) out.description = desc;

  if (resolved.enum) out.enum = resolved.enum;
  if (resolved.minimum !== undefined) out.minimum = resolved.minimum;
  if (resolved.maximum !== undefined) out.maximum = resolved.maximum;
  if (resolved.format) out.format = resolved.format;
  if (resolved.pattern) out.pattern = resolved.pattern;

  // Array items
  if (resolved.items) {
    out.items = convertProperty(spec, resolved.items);
  }

  // Nested object properties (for top-level requestBody schemas)
  if (resolved.properties && topLevel) {
    const props: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(resolved.properties)) {
      props[key] = convertProperty(spec, val);
    }
    out.properties = props;
    if (resolved.required) out.required = resolved.required;
  }

  return out;
}

// ── Description builder ────────────────────────────────────────────────────

function buildDescription(op: OpenApiOperation): string {
  // Use summary as base (terse), append description if it adds meaningful info
  const summary = (op.summary ?? "").trim();
  const desc = (op.description ?? "").trim().replace(/\n+/g, " ").replace(/\s+/g, " ");
  const price = op["x-price"];

  let text = summary;

  // Append description if it's substantively different from summary
  if (desc && desc !== summary) {
    // Truncate long descriptions — keep first sentence (not splitting on decimal points)
    // Matches sentences ending with punctuation that is NOT preceded by a digit
    const firstSentence = desc.match(/^(.*?(?<!\d)[.!?])(?:\s|$)/)?.[1]?.trim();
    const snippet = firstSentence ?? (desc.length > 120 ? `${desc.slice(0, 120)}…` : desc);
    if (snippet && snippet !== summary) {
      // Avoid double-period if text already ends with punctuation
      const sep = /[.!?]$/.test(text) ? " " : ". ";
      text = `${text}${sep}${snippet}`;
    }
  }

  // Append pricing
  if (price) {
    // Avoid double-period if text already ends with punctuation
    const sep = /[.!?]$/.test(text) ? " " : ". ";
    text = `${text}${sep}Price: ${price} via x402 (USDC on Base).`;
  } else {
    // Check if truly free (security: []) or just missing x-price
    if (op.security && op.security.length === 0) {
      const sep = /[.!?]$/.test(text) ? " " : ". ";
      text = `${text}${sep}Free — no payment required.`;
    }
  }

  return text;
}

// ── Parameters builder ─────────────────────────────────────────────────────

interface ParametersResult {
  properties: Record<string, unknown>;
  required: string[];
}

function buildParameters(spec: OpenApiSpec, op: OpenApiOperation): ParametersResult {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  // 1. Path and query parameters
  for (const param of op.parameters ?? []) {
    if (param.in !== "path" && param.in !== "query") continue;
    const schema = param.schema ? convertProperty(spec, param.schema) : { type: "string" };
    if (param.description && !schema.description) {
      schema.description = param.description;
    } else if (param.description && schema.description !== param.description) {
      // Use the parameter-level description (more specific than schema description)
      schema.description = param.description;
    }
    properties[param.name] = schema;
    if (param.required) required.push(param.name);
  }

  // 2. Request body (application/json only)
  if (op.requestBody?.content) {
    const jsonContent = op.requestBody.content["application/json"];
    if (jsonContent?.schema) {
      const bodySchema = resolveProperty(spec, jsonContent.schema);
      for (const [key, val] of Object.entries(bodySchema.properties ?? {})) {
        properties[key] = convertProperty(spec, val);
      }
      if (bodySchema.required) {
        for (const r of bodySchema.required) {
          if (!required.includes(r)) required.push(r);
        }
      }
    }
  }

  return { properties, required };
}

// ── Spec → tools ───────────────────────────────────────────────────────────

function specToTools(specId: string, spec: OpenApiSpec): OpenAiFunction[] {
  const tools: OpenAiFunction[] = [];
  const overrides = SPEC_OPERATION_OVERRIDES[specId] ?? {};

  for (const [, methods] of Object.entries(spec.paths ?? {})) {
    for (const [, op] of Object.entries(methods as Record<string, OpenApiOperation>)) {
      const { operationId } = op;
      if (!operationId) continue;
      if (SKIP_OPERATIONS.has(operationId)) continue;

      // Resolve tool name: spec override > global map > auto-derive
      const toolName =
        overrides[operationId] ??
        OPERATION_ID_TO_TOOL_NAME[operationId] ??
        `${specId}_${operationId
          .replace(/([A-Z])/g, "_$1")
          .toLowerCase()
          .replace(/^_/, "")}`;

      const description = buildDescription(op);
      const { properties, required } = buildParameters(spec, op);

      const fn: OpenAiFunction = {
        type: "function",
        function: {
          name: toolName,
          description,
          parameters: {
            type: "object",
            properties,
          },
        },
      };

      if (required.length > 0) {
        fn.function.parameters.required = required;
      }

      tools.push(fn);
    }
  }

  return tools;
}

// ── File write / check ─────────────────────────────────────────────────────

function applyFile(filePath: string, content: string): void {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  const changed = existing !== content;

  if (CHECK_MODE) {
    if (changed) {
      console.error(`  ✗ ${filePath} is out of date — run pnpm gen:openai`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${filePath}`);
    }
  } else {
    writeFileSync(filePath, content);
    console.log(`  ${changed ? "↺" : "✓"} ${filePath}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

if (!CHECK_MODE) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const specFiles = primsForInterface("openai").map((p) => `${p.id}.yaml`);

console.log(`Processing ${specFiles.length} OpenAPI specs`);
console.log(CHECK_MODE ? "Mode: check\n" : "Mode: generate\n");

const allTools: OpenAiFunction[] = [];
const primIds: string[] = [];

for (const specFile of specFiles) {
  const specId = basename(specFile, ".yaml");
  const specPath = join(SPECS_DIR, specFile);

  let spec: OpenApiSpec;
  try {
    spec = parseYaml(readFileSync(specPath, "utf8")) as OpenApiSpec;
  } catch (e) {
    console.error(`  ERROR: Failed to parse ${specFile}: ${e}`);
    anyFailed = true;
    continue;
  }

  const tools = specToTools(specId, spec);
  if (tools.length === 0) {
    console.log(`  – ${specId}: no paid operations (skipped)`);
    continue;
  }

  primIds.push(specId);
  allTools.push(...tools);

  const perPrimJson = `${JSON.stringify(tools, null, 2)}\n`;
  applyFile(join(OUTPUT_DIR, `${specId}.json`), perPrimJson);
  console.log(`     ${tools.length} tool(s)`);
}

// Combined all.json
const allJson = `${JSON.stringify(allTools, null, 2)}\n`;
applyFile(join(OUTPUT_DIR, "all.json"), allJson);
console.log(`  total: ${allTools.length} tools across ${primIds.length} prims`);

// manifest.json
const manifest = {
  version: "1.0.0",
  generated_at: new Date().toISOString(),
  prims: primIds,
  tool_count: allTools.length,
};
// In check mode we compare manifest ignoring generated_at (it always changes)
if (CHECK_MODE) {
  const existing = existsSync(join(OUTPUT_DIR, "manifest.json"))
    ? readFileSync(join(OUTPUT_DIR, "manifest.json"), "utf8")
    : null;
  if (existing) {
    const existingParsed = JSON.parse(existing) as typeof manifest;
    const matches =
      existingParsed.version === manifest.version &&
      JSON.stringify(existingParsed.prims) === JSON.stringify(manifest.prims) &&
      existingParsed.tool_count === manifest.tool_count;
    if (!matches) {
      console.error(
        `  ✗ ${join(OUTPUT_DIR, "manifest.json")} is out of date — run pnpm gen:openai`,
      );
      anyFailed = true;
    } else {
      console.log(`  ✓ ${join(OUTPUT_DIR, "manifest.json")}`);
    }
  } else {
    console.error(`  ✗ ${join(OUTPUT_DIR, "manifest.json")} missing — run pnpm gen:openai`);
    anyFailed = true;
  }
} else {
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(OUTPUT_DIR, "manifest.json"), manifestJson);
  console.log(`  ✓ ${join(OUTPUT_DIR, "manifest.json")}`);
}

if (CHECK_MODE && anyFailed) {
  console.error("\nOpenAI schemas are out of date. Run: pnpm gen:openai");
  process.exit(1);
} else if (CHECK_MODE) {
  console.log("\nAll OpenAI schemas are up to date.");
} else {
  console.log("\nDone.");
}
