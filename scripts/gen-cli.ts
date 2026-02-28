#!/usr/bin/env bun
/**
 * gen-cli.ts — CLI command generator
 *
 * Reads specs/openapi/<id>.yaml and generates
 * packages/keystore/src/<id>-commands.ts for each primitive.
 *
 * Files without the "// BEGIN:PRIM:CLI" marker are treated as manually
 * maintained and are skipped. Add the marker to opt a file into generation.
 * New files (no existing file) are always generated.
 *
 * Usage:
 *   bun scripts/gen-cli.ts          # regenerate all opted-in + new
 *   bun scripts/gen-cli.ts --check  # exit 1 if any opted-in file would change
 *   bun scripts/gen-cli.ts search   # regenerate one prim by id
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { primsForInterface } from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");
const CHECK_MODE = process.argv.includes("--check");
const TARGET_PRIM = process.argv.slice(2).find((a) => !a.startsWith("--"));

// ── OpenAPI types ────────────────────────────────────────────────────────────

interface OpenAPISpec {
  info: { title: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, unknown>;
  };
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
}

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  security?: unknown[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, unknown>;
  "x-price"?: string;
}

interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
}

interface RequestBody {
  required?: boolean;
  content?: {
    "application/json"?: {
      schema?: SchemaObject;
    };
  };
}

interface SchemaObject {
  type?: string | string[];
  properties?: Record<string, SchemaObject>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  description?: string;
  items?: SchemaObject;
  oneOf?: SchemaObject[];
  $ref?: string;
  minimum?: number;
  maximum?: number;
}

// ── Route analysis ────────────────────────────────────────────────────────────

interface RouteOperation {
  path: string;
  method: string;
  operation: Operation;
  pathParams: string[];
  queryParams: Parameter[];
  bodySchema: SchemaObject | null;
  isFree: boolean;
  /** CLI subgroup name (e.g. "pool", "ssh-key", "cache"). Null = top-level. */
  subgroup: string | null;
  /** The CLI leaf subcommand name (e.g. "ls", "get", "create"). */
  leafName: string;
  /**
   * Safe JS identifier for the subgroup (e.g. "pool" → "pool", "ssh-key" → "sshKey").
   * Used as a variable name in generated code.
   */
  subgroupVar: string | null;
}

function isSkipped(op: Operation): boolean {
  const id = op.operationId ?? "";
  // Skip health check and machine-readable docs — not CLI commands
  return id === "healthCheck" || id === "llmsTxt" || id === "getLlmsTxt";
}

function isFreeOperation(op: Operation): boolean {
  if (!op.security) return false;
  return op.security.length === 0;
}

function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

function resolveSchemaRef(
  spec: OpenAPISpec,
  schema: SchemaObject | undefined,
): SchemaObject | null {
  if (!schema) return null;
  if (schema.$ref) {
    // biome-ignore lint/style/noNonNullAssertion: split always returns at least one element
    const refName = schema.$ref.split("/").pop()!;
    const resolved = spec.components?.schemas?.[refName] as SchemaObject | undefined;
    return resolved ?? null;
  }
  return schema;
}

function getBodySchema(spec: OpenAPISpec, op: Operation): SchemaObject | null {
  const content = op.requestBody?.content?.["application/json"];
  if (!content) return null;
  return resolveSchemaRef(spec, content.schema ?? undefined);
}

// JS reserved words that cannot be used as variable names
const JS_RESERVED = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

/**
 * Convert a kebab-case or snake_case string to camelCase for use as a JS identifier.
 * e.g. "ssh-key" → "sshKey", "zone_id" → "zoneId"
 * Appends "Val" to avoid reserved keywords: "delete" → "deleteVal"
 */
function toVarName(name: string): string {
  const camel = name
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return JS_RESERVED.has(camel) ? `${camel}Val` : camel;
}

/**
 * Convert a snake_case or camelCase property name to a CLI flag name.
 * e.g. "max_results" → "max-results", "initialSupply" → "initial-supply"
 */
function toFlagName(name: string): string {
  return name
    .replace(/_/g, "-")
    .replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`)
    .replace(/^-/, "");
}

/**
 * Determine the subgroup and leaf name for a route.
 *
 * Strategy: look at path segments after /v1/<resource>. If there's a
 * non-path-param segment that appears multiple times across routes for
 * the same prim, it's a subgroup. Actions after a path param
 * (e.g. /start, /stop, /reboot) are top-level subcommands.
 *
 * Subgroup detection heuristic:
 * - /v1/tokens/{id}/pool      → subgroup="pool",     leaf from opId
 * - /v1/ssh-keys              → subgroup=null,        leaf="ls"/"add"/"rm"
 * - /v1/zones/{id}/records    → subgroup="record",    leaf from opId
 * - /v1/cache/{ns}/{key}      → subgroup="cache",     leaf from opId
 */
function classifyRoute(
  path: string,
  method: string,
  op: Operation,
): { subgroup: string | null; leafName: string } {
  const opId = op.operationId ?? "";
  const leafName = deriveLeafName(opId, method, path);

  // Strip /v1/ prefix and split into segments
  const withoutV1 = path.replace(/^\/v1\//, "");
  const segments = withoutV1.split("/").filter(Boolean);

  if (segments.length === 0) return { subgroup: null, leafName };

  // Find the base resource (first segment, no curly braces)
  const baseSegment = segments[0]; // e.g. "tokens", "ssh-keys", "zones"

  // Count non-param segments after the base resource
  const afterBase = segments.slice(1);

  // Identify candidate subgroup: a non-param segment that is NOT an action word
  // that maps directly to a top-level CLI verb (start/stop/reboot etc.)
  const actionWords = new Set([
    "start",
    "stop",
    "reboot",
    "rebuild",
    "resize",
    "activate",
    "verify",
    "renew",
    "send",
    "quota",
    "reconcile",
    "mail-setup",
    "configure-ns",
  ]);

  // Check if there's a non-param segment after the first path param
  let foundPathParam = false;
  for (const seg of afterBase) {
    if (seg.startsWith("{")) {
      foundPathParam = true;
      continue;
    }
    if (foundPathParam) {
      // Sub-resource after a path param
      // If this is a well-known sub-resource, make it a subgroup
      const subResources = new Set([
        "pool",
        "records",
        "webhooks",
        "ssh-keys",
        "objects",
        "upsert",
        "query",
        "cache",
      ]);
      // "liquidity-params" is part of pool subgroup
      if (seg === "liquidity-params") {
        return { subgroup: "pool", leafName };
      }
      if (subResources.has(seg)) {
        // Singularize for display: "records" → "record", "webhooks" → "webhook"
        const sg = singularizeSubgroup(seg);
        return { subgroup: sg, leafName };
      }
      // Action words after a path param are NOT subgroups — they're top-level
      // e.g. /v1/servers/{id}/start → sub="start"
      return { subgroup: null, leafName };
    }
  }

  // For /v1/cache/{namespace}/{key} — "cache" is the base and IS the subgroup
  // For /v1/ssh-keys and /v1/ssh-keys/{id} — "ssh-keys" is the base resource
  // The subgroup check: does the base segment look like a sub-resource that
  // has a different "parent" resource in the same spec?
  // We handle this by checking if "cache" is a segment of a longer path.
  // Actually: /v1/cache/{ns}/{key} → subgroup="cache" because "cache" is
  // logically separate from the collection operations

  return { subgroup: null, leafName };
}

function singularizeSubgroup(seg: string): string {
  // Conservative singularization — only for known plural forms
  const known: Record<string, string> = {
    records: "record",
    webhooks: "webhook",
    objects: "object",
    "ssh-keys": "ssh-key",
    upsert: "upsert",
    query: "query",
    cache: "cache",
    pool: "pool",
  };
  return known[seg] ?? seg;
}

function deriveLeafName(opId: string, method: string, path: string): string {
  if (!opId) return method.toLowerCase();

  // Direct operationId → CLI name mappings
  const directMap: Record<string, string> = {
    listCollections: "ls",
    createCollection: "create",
    getCollection: "get",
    deleteCollection: "rm",
    upsertDocuments: "upsert",
    queryCollection: "query",
    setCache: "put",
    getCache: "get",
    deleteCache: "rm",
    listTokens: "ls",
    deployToken: "deploy",
    getToken: "get",
    mintTokens: "mint",
    getTokenSupply: "supply",
    createPool: "create",
    getPool: "get",
    getLiquidityParams: "params",
    dripUsdc: "usdc",
    dripEth: "eth",
    getFaucetStatus: "status",
    searchDomains: "search",
    quoteDomain: "quote",
    registerDomain: "register",
    recoverRegistration: "recover",
    getDomainStatus: "status",
    configureNs: "ns",
    listZones: "ls",
    createZone: "create",
    getZone: "get",
    deleteZone: "rm",
    activateZone: "activate",
    verifyZone: "verify",
    setupMail: "mail-setup",
    batchRecords: "batch",
    listRecords: "ls",
    createRecord: "create",
    getRecord: "get",
    updateRecord: "update",
    deleteRecord: "rm",
    listBuckets: "ls",
    createBucket: "create-bucket",
    getBucket: "get-bucket",
    deleteBucket: "rm-bucket",
    listObjects: "ls",
    getObject: "get",
    putObject: "put",
    deleteObject: "rm",
    getQuota: "quota",
    setQuota: "set-quota",
    reconcileQuota: "reconcile-quota",
    listServers: "ls",
    createServer: "create",
    getServer: "get",
    deleteServer: "rm",
    startServer: "start",
    stopServer: "stop",
    rebootServer: "reboot",
    resizeServer: "resize",
    rebuildServer: "rebuild",
    listSshKeys: "ls",
    createSshKey: "add",
    deleteSshKey: "rm",
    searchWeb: "web",
    searchNews: "news",
    extractUrls: "extract",
    // email
    createMailbox: "create",
    listMailboxes: "ls",
    getMailbox: "get",
    deleteMailbox: "rm",
    renewMailbox: "renew",
    listMessages: "inbox",
    getMessage: "read",
    sendMessage: "send",
    addWebhook: "add",
    listWebhooks: "ls",
    deleteWebhook: "rm",
    addDomain: "add",
    listDomains: "ls",
    getDomain: "get",
    verifyDomain: "verify",
    deleteDomain: "rm",
    // create
    getSchema: "schema",
    getPorts: "ports",
  };

  if (directMap[opId]) return directMap[opId];

  // Fallback: convert camelCase operationId to a CLI name
  const words = opId
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase()
    .split(" ");
  if (words[0] === "list") return "ls";
  if (words[0] === "create") return "create";
  if (words[0] === "get") return "get";
  if (words[0] === "delete" || words[0] === "remove") return "rm";
  if (words[0] === "update" || words[0] === "set") return "update";
  return words[words.length - 1] ?? method.toLowerCase();
}

function parseRoutes(spec: OpenAPISpec): RouteOperation[] {
  const routes: RouteOperation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of ["get", "post", "put", "delete", "patch"] as const) {
      const op = pathItem[method];
      if (!op) continue;
      if (isSkipped(op)) continue;

      const pathParams = extractPathParams(path);
      const queryParams = (op.parameters ?? []).filter((p) => p.in === "query");
      const bodySchema = getBodySchema(spec, op);
      const isFree = isFreeOperation(op);
      const { subgroup, leafName } = classifyRoute(path, method, op);

      routes.push({
        path,
        method: method.toUpperCase(),
        operation: op,
        pathParams,
        queryParams,
        bodySchema,
        isFree,
        subgroup,
        leafName,
        subgroupVar: subgroup ? toVarName(subgroup) : null,
      });
    }
  }

  // Post-process: group cache routes under "cache" subgroup.
  // The /v1/cache/{namespace}/{key} routes have "cache" as their base resource,
  // so we need to detect this pattern separately.
  for (const r of routes) {
    if (r.path.startsWith("/v1/cache/")) {
      r.subgroup = "cache";
      r.subgroupVar = "cache";
    }
  }

  return routes;
}

// ── Property extraction ───────────────────────────────────────────────────────

interface PropInfo {
  name: string;
  required: boolean;
  type: string;
  description: string;
  defaultVal?: unknown;
}

function getBodyProps(spec: OpenAPISpec, bodySchema: SchemaObject | null): PropInfo[] {
  if (!bodySchema) return [];
  const resolved = resolveSchemaRef(spec, bodySchema);
  if (!resolved?.properties) return [];
  const requiredList = resolved.required ?? [];
  return Object.entries(resolved.properties).map(([name, prop]) => {
    const resolvedProp = resolveSchemaRef(spec, prop as SchemaObject) ?? (prop as SchemaObject);
    const rawType = resolvedProp.type;
    const typeStr = Array.isArray(rawType)
      ? rawType.filter((t) => t !== "null").join("|")
      : (rawType ?? "string");
    return {
      name,
      required: requiredList.includes(name),
      type: typeStr,
      description: resolvedProp.description ?? "",
      defaultVal: resolvedProp.default,
    };
  });
}

/**
 * Pick the primary positional arg for a route body.
 * Returns the property name if there's an obvious "primary" field.
 */
function pickPositionalArg(bodyProps: PropInfo[], pathParams: string[]): string | null {
  // Don't assign positional if there are multiple path params already
  if (pathParams.length >= 2) return null;

  const primaryNames = ["query", "text", "address"];
  for (const pname of primaryNames) {
    const prop = bodyProps.find((p) => p.name === pname && p.required && p.type === "string");
    if (prop) return prop.name;
  }
  return null;
}

// ── Code generation ─────────────────────────────────────────────────────────

interface PrimConfig {
  id: string;
  defaultUrl: string;
  envVar: string;
  funcName: string;
  resolverName: string;
  isFaucetLike: boolean;
  maxPayment: string;
}

function derivePrimConfig(spec: OpenAPISpec, id: string): PrimConfig {
  const serverUrl = spec.servers?.[0]?.url ?? `https://${id}.prim.sh`;
  const pascal = id.charAt(0).toUpperCase() + id.slice(1);

  // Faucet-like: no x402 payment at all
  const allOps = Object.values(spec.paths).flatMap(
    (pi) =>
      (["get", "post", "put", "delete", "patch"] as const)
        .map((m) => pi[m])
        .filter(Boolean) as Operation[],
  );
  const paidOps = allOps.filter((op) => !isSkipped(op) && !isFreeOperation(op));
  const isFaucetLike = paidOps.length === 0;

  return {
    id,
    defaultUrl: serverUrl,
    envVar: `PRIM_${id.toUpperCase()}_URL`,
    funcName: `run${pascal}Command`,
    resolverName: `resolve${pascal}Url`,
    isFaucetLike,
    maxPayment: inferMaxPayment(spec),
  };
}

function inferMaxPayment(spec: OpenAPISpec): string {
  let max = 1.0;
  for (const pathItem of Object.values(spec.paths)) {
    for (const method of ["get", "post", "put", "delete", "patch"] as const) {
      const op = pathItem[method] as (Operation & { "x-price"?: string }) | undefined;
      if (!op) continue;
      const price = op["x-price"];
      if (price) {
        const num = Number.parseFloat(price.replace("$", ""));
        if (!Number.isNaN(num) && num > max) max = num;
      }
    }
  }
  return max.toFixed(2);
}

// ── Handler body codegen ──────────────────────────────────────────────────────

function genHandlerBody(
  spec: OpenAPISpec,
  route: RouteOperation,
  prim: PrimConfig,
  /** How many argv positions are consumed before the args of this handler. */
  argvOffset: number,
): string {
  const lines: string[] = [];
  const ind = "      "; // 6 spaces (inside case block)

  const bodyProps = getBodyProps(spec, route.bodySchema);
  const { pathParams, queryParams } = route;

  // --- Path params (positional) ---
  const pathParamVars: string[] = [];
  for (let i = 0; i < pathParams.length; i++) {
    const camel = toVarName(pathParams[i]);
    lines.push(`${ind}const ${camel} = argv[${argvOffset + i}];`);
    pathParamVars.push(camel);
  }

  // --- Primary positional body arg ---
  const positionalField =
    route.method === "POST" || route.method === "PUT"
      ? pickPositionalArg(bodyProps, pathParams)
      : null;
  let positionalVar: string | null = null;

  if (positionalField && pathParams.length === 0) {
    positionalVar = toVarName(positionalField);
    lines.push(`${ind}const ${positionalVar} = argv[${argvOffset}];`);
  }

  // --- Flag declarations ---
  const flagVarMap = new Map<string, string>(); // propName → varName

  for (const prop of bodyProps) {
    if (prop.name === positionalField) continue; // already positional
    if (pathParams.includes(prop.name)) continue; // in path
    const flag = toFlagName(prop.name);
    const varName = toVarName(prop.name);
    if (prop.type === "boolean") {
      lines.push(`${ind}const ${varName} = hasFlag("${flag}", argv);`);
    } else if (prop.defaultVal !== undefined) {
      lines.push(`${ind}const ${varName} = getFlag("${flag}", argv) ?? "${prop.defaultVal}";`);
    } else {
      lines.push(`${ind}const ${varName} = getFlag("${flag}", argv);`);
    }
    flagVarMap.set(prop.name, varName);
  }

  for (const qp of queryParams) {
    if (flagVarMap.has(qp.name)) continue;
    const flag = toFlagName(qp.name);
    const varName = toVarName(qp.name);
    if (qp.schema?.type === "boolean") {
      lines.push(`${ind}const ${varName} = hasFlag("${flag}", argv);`);
    } else if (qp.schema?.default !== undefined) {
      lines.push(`${ind}const ${varName} = getFlag("${flag}", argv) ?? "${qp.schema.default}";`);
    } else {
      lines.push(`${ind}const ${varName} = getFlag("${flag}", argv);`);
    }
    flagVarMap.set(qp.name, varName);
  }

  // --- Required check ---
  const requiredVars: string[] = [...pathParamVars];
  if (positionalVar) requiredVars.push(positionalVar);
  for (const prop of bodyProps) {
    if (prop.name === positionalField) continue;
    if (pathParams.includes(prop.name)) continue;
    if (prop.required && prop.type !== "boolean") {
      requiredVars.push(flagVarMap.get(prop.name) ?? toVarName(prop.name));
    }
  }

  if (requiredVars.length > 0) {
    const usageStr = buildUsageString(
      route,
      prim,
      pathParams,
      positionalField,
      bodyProps,
      argvOffset,
    );
    lines.push(`${ind}if (${requiredVars.map((v) => `!${v}`).join(" || ")}) {`);
    lines.push(`${ind}  process.stderr.write(`);
    lines.push(`${ind}    "${usageStr}\\n",`);
    lines.push(`${ind}  );`);
    lines.push(`${ind}  process.exit(1);`);
    lines.push(`${ind}}`);
  }

  // --- Build request body ---
  const hasBody = (route.method === "POST" || route.method === "PUT") && bodyProps.length > 0;

  if (hasBody) {
    lines.push(`${ind}const reqBody: Record<string, unknown> = {};`);
    if (positionalVar && positionalField) {
      lines.push(`${ind}reqBody.${positionalField} = ${positionalVar};`);
    }
    for (const prop of bodyProps) {
      if (prop.name === positionalField) continue;
      if (pathParams.includes(prop.name)) continue;
      const varName = flagVarMap.get(prop.name) ?? toVarName(prop.name);
      if (prop.type === "boolean") {
        lines.push(`${ind}if (${varName}) reqBody.${prop.name} = true;`);
      } else if (prop.required) {
        if (prop.type === "integer" || prop.type === "number") {
          lines.push(`${ind}reqBody.${prop.name} = Number(${varName});`);
        } else {
          lines.push(`${ind}reqBody.${prop.name} = ${varName};`);
        }
      } else if (prop.type === "integer" || prop.type === "number") {
        lines.push(`${ind}if (${varName}) reqBody.${prop.name} = Number(${varName});`);
      } else {
        lines.push(`${ind}if (${varName}) reqBody.${prop.name} = ${varName};`);
      }
    }
  }

  // --- Build URL ---
  let urlPath = route.path;
  for (let i = 0; i < pathParams.length; i++) {
    urlPath = urlPath.replace(`{${pathParams[i]}}`, `\${${pathParamVars[i]}}`);
  }

  const hasQueryParams = queryParams.length > 0;
  if (hasQueryParams) {
    lines.push(`${ind}const reqUrl = new URL(\`\${baseUrl}${urlPath}\`);`);
    for (const qp of queryParams) {
      const varName = flagVarMap.get(qp.name) ?? toVarName(qp.name);
      if (qp.schema?.type === "boolean") {
        lines.push(`${ind}if (${varName}) reqUrl.searchParams.set("${qp.name}", "true");`);
      } else {
        lines.push(`${ind}if (${varName}) reqUrl.searchParams.set("${qp.name}", ${varName});`);
      }
    }
  }

  const fetchUrl = hasQueryParams ? "reqUrl.toString()" : `\`\${baseUrl}${urlPath}\``;
  const fetchFn = prim.isFaucetLike ? "fetch" : "primFetch";

  // --- Make request ---
  if (hasBody) {
    lines.push(`${ind}const res = await ${fetchFn}(${fetchUrl}, {`);
    lines.push(`${ind}  method: "${route.method}",`);
    lines.push(`${ind}  headers: { "Content-Type": "application/json" },`);
    lines.push(`${ind}  body: JSON.stringify(reqBody),`);
    lines.push(`${ind}});`);
  } else if (route.method === "DELETE") {
    lines.push(`${ind}const res = await ${fetchFn}(${fetchUrl}, { method: "DELETE" });`);
  } else if (route.method !== "GET") {
    lines.push(`${ind}const res = await ${fetchFn}(${fetchUrl}, { method: "${route.method}" });`);
  } else {
    lines.push(`${ind}const res = await ${fetchFn}(${fetchUrl});`);
  }

  lines.push(`${ind}if (!res.ok) return handleError(res);`);

  // --- Response ---
  if (route.method === "DELETE" && !hasBody) {
    lines.push(`${ind}if (!quiet) {`);
    lines.push(`${ind}  const data = await res.json();`);
    lines.push(`${ind}  console.log(JSON.stringify(data, null, 2));`);
    lines.push(`${ind}}`);
  } else {
    lines.push(`${ind}const data = await res.json();`);
    lines.push(`${ind}if (quiet) {`);
    lines.push(`${ind}  console.log(JSON.stringify(data));`);
    lines.push(`${ind}} else {`);
    lines.push(`${ind}  console.log(JSON.stringify(data, null, 2));`);
    lines.push(`${ind}}`);
  }

  return lines.join("\n");
}

function buildUsageString(
  route: RouteOperation,
  prim: PrimConfig,
  pathParams: string[],
  positionalField: string | null,
  bodyProps: PropInfo[],
  argvOffset: number,
): string {
  const parts = ["prim", prim.id];
  if (route.subgroup) parts.push(route.subgroup);
  parts.push(route.leafName);

  for (const p of pathParams) {
    parts.push(p.toUpperCase());
  }
  if (positionalField) {
    parts.push(positionalField.toUpperCase());
  }

  const opts: string[] = [];
  for (const prop of bodyProps) {
    if (prop.name === positionalField) continue;
    if (pathParams.includes(prop.name)) continue;
    const flag = toFlagName(prop.name);
    if (prop.required && prop.type !== "boolean") {
      parts.push(`--${flag} ${prop.name.toUpperCase()}`);
    } else if (prop.type === "boolean") {
      opts.push(`[--${flag}]`);
    } else {
      opts.push(`[--${flag} VALUE]`);
    }
  }
  for (const qp of route.queryParams) {
    const flag = toFlagName(qp.name);
    if (qp.required) {
      parts.push(`--${flag} ${qp.name.toUpperCase()}`);
    } else {
      opts.push(`[--${flag} VALUE]`);
    }
  }

  if (opts.length > 0) {
    parts.push(opts.slice(0, 3).join(" ")); // cap to avoid super-long usage lines
  }

  return `Usage: ${parts.join(" ")}`;
}

// ── File generator ────────────────────────────────────────────────────────────

function generateCommandFile(spec: OpenAPISpec, id: string): string {
  const prim = derivePrimConfig(spec, id);
  const routes = parseRoutes(spec);

  if (routes.length === 0) {
    return [
      "// Generated by scripts/gen-cli.ts — do not edit manually.",
      "// Regenerate: pnpm gen:cli",
      "// BEGIN:PRIM:CLI",
      "",
      `// No CLI routes found in ${id}.yaml`,
      "",
      "// END:PRIM:CLI",
      "",
    ].join("\n");
  }

  // Group into subgroups and top-level
  const subgroupMap = new Map<string, RouteOperation[]>();
  const topLevel: RouteOperation[] = [];

  for (const r of routes) {
    if (r.subgroup) {
      const list = subgroupMap.get(r.subgroup) ?? [];
      list.push(r);
      subgroupMap.set(r.subgroup, list);
    } else {
      topLevel.push(r);
    }
  }

  const topLevelCmds = topLevel.map((r) => r.leafName);
  const subgroupCmds = [...subgroupMap.keys()];
  const allCmds = [...topLevelCmds, ...subgroupCmds].join("|");

  const lines: string[] = [];

  lines.push("// Generated by scripts/gen-cli.ts — do not edit manually.");
  lines.push("// Regenerate: pnpm gen:cli");
  lines.push("// BEGIN:PRIM:CLI");
  lines.push("");

  // Imports
  if (prim.isFaucetLike) {
    lines.push(`import { getDefaultAddress } from "./config.ts";`);
    lines.push(`import { getFlag, hasFlag } from "./flags.ts";`);
  } else {
    lines.push(`import { createPrimFetch } from "@primsh/x402-client";`);
    lines.push(`import { getConfig } from "./config.ts";`);
    lines.push(`import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";`);
  }
  lines.push("");

  // URL resolver
  lines.push(`export function ${prim.resolverName}(argv: string[]): string {`);
  lines.push(`  const flag = getFlag("url", argv);`);
  lines.push("  if (flag) return flag;");
  lines.push(`  if (process.env.${prim.envVar}) return process.env.${prim.envVar};`);
  lines.push(`  return "${prim.defaultUrl}";`);
  lines.push("}");
  lines.push("");

  // Error handler
  lines.push("async function handleError(res: Response): Promise<never> {");
  lines.push("  let message = `HTTP ${res.status}`;");
  lines.push(`  let code = "unknown";`);
  lines.push("  try {");
  lines.push(
    "    const body = (await res.json()) as { error?: { code: string; message: string } };",
  );
  lines.push("    if (body.error) {");
  lines.push("      message = body.error.message;");
  lines.push("      code = body.error.code;");
  lines.push("    }");
  lines.push("  } catch {");
  lines.push("    // ignore parse error");
  lines.push("  }");
  lines.push("  process.stderr.write(`Error: ${message} (${code})\\n`);");
  lines.push("  process.exit(1);");
  lines.push("}");
  lines.push("");

  // Main command function
  lines.push(
    `export async function ${prim.funcName}(sub: string, argv: string[]): Promise<void> {`,
  );
  lines.push(`  const baseUrl = ${prim.resolverName}(argv);`);
  lines.push(`  const quiet = hasFlag("quiet", argv);`);

  if (!prim.isFaucetLike) {
    lines.push(`  const walletFlag = getFlag("wallet", argv);`);
    lines.push("  const passphrase = await resolvePassphrase(argv);");
    lines.push(`  const maxPaymentFlag = getFlag("max-payment", argv);`);
    lines.push("  const config = await getConfig();");
    lines.push("  const primFetch = createPrimFetch({");
    lines.push("    keystore:");
    lines.push("      walletFlag !== undefined || passphrase !== undefined");
    lines.push("        ? { address: walletFlag, passphrase }");
    lines.push("        : true,");
    lines.push(
      `    maxPayment: maxPaymentFlag ?? process.env.PRIM_MAX_PAYMENT ?? "${prim.maxPayment}",`,
    );
    lines.push("    network: config.network,");
    lines.push("  });");
  }
  lines.push("");

  // Help block
  lines.push(`  if (!sub || sub === "--help" || sub === "-h") {`);
  lines.push(`    console.log("Usage: prim ${prim.id} <${allCmds}> [args] [flags]");`);
  lines.push(`    console.log("");`);
  for (const r of topLevel) {
    const u = buildUsageString(r, prim, r.pathParams, null, getBodyProps(spec, r.bodySchema), 2);
    lines.push(`    console.log("  ${u}");`);
  }
  for (const [sg, sgRoutes] of subgroupMap) {
    for (const r of sgRoutes) {
      const u = buildUsageString(r, prim, r.pathParams, null, getBodyProps(spec, r.bodySchema), 3);
      lines.push(`    console.log("  ${u}");`);
    }
  }
  lines.push("    process.exit(1);");
  lines.push("  }");
  lines.push("");

  // Subgroup dispatchers
  for (const [sg, sgRoutes] of subgroupMap) {
    const sgVar = toVarName(sg); // "ssh-key" → "sshKey", "pool" → "pool"
    lines.push(`  // ${sg} subcommands`);
    lines.push(`  if (sub === "${sg}") {`);
    lines.push(`    const ${sgVar}Sub = argv[2];`);
    lines.push(`    switch (${sgVar}Sub) {`);
    for (const r of sgRoutes) {
      lines.push(`      case "${r.leafName}": {`);
      lines.push(genHandlerBody(spec, r, prim, 3));
      lines.push("        break;");
      lines.push("      }");
      lines.push("");
    }
    const leaves = sgRoutes.map((r) => r.leafName).join("|");
    lines.push("      default:");
    lines.push(`        console.log("Usage: prim ${prim.id} ${sg} <${leaves}>");`);
    lines.push("        process.exit(1);");
    lines.push("    }");
    lines.push("    return;");
    lines.push("  }");
    lines.push("");
  }

  // Top-level switch
  if (topLevel.length > 0) {
    lines.push("  switch (sub) {");
    for (const r of topLevel) {
      lines.push(`    case "${r.leafName}": {`);
      lines.push(genHandlerBody(spec, r, prim, 2));
      lines.push("      break;");
      lines.push("    }");
      lines.push("");
    }
    lines.push("    default:");
    lines.push(`      console.log("Usage: prim ${prim.id} <${allCmds}>");`);
    lines.push("      process.exit(1);");
    lines.push("  }");
  } else {
    // All subcommands are in subgroups — no top-level switch needed
    lines.push(`  console.log("Usage: prim ${prim.id} <${allCmds}>");`);
    lines.push("  process.exit(1);");
  }

  lines.push("}");
  lines.push("");
  lines.push("// END:PRIM:CLI");
  lines.push("");

  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

let anyFailed = false;
const specsDir = join(ROOT, "specs/openapi");
const keystoreSrcDir = join(ROOT, "packages/keystore/src");

// Prims with OpenAPI specs that have CLI commands
// (wallet is excluded — its CLI is part of cli.ts directly)
// wallet excluded — its CLI is hand-maintained in cli.ts
const CLI_PRIMS = primsForInterface("cli")
  .map((p) => p.id)
  .filter((id) => id !== "wallet");

const primsToProcess = TARGET_PRIM ? [TARGET_PRIM] : CLI_PRIMS;

console.log(`Mode: ${CHECK_MODE ? "check" : "generate"}\n`);

for (const id of primsToProcess) {
  const specPath = join(specsDir, `${id}.yaml`);
  if (!existsSync(specPath)) {
    console.log(`  – specs/openapi/${id}.yaml not found, skipping`);
    continue;
  }

  const outPath = join(keystoreSrcDir, `${id}-commands.ts`);

  let spec: OpenAPISpec;
  try {
    const raw = readFileSync(specPath, "utf8");
    spec = parseYaml(raw) as OpenAPISpec;
  } catch (err) {
    console.error(`  ✗ Failed to parse ${id}.yaml: ${err}`);
    anyFailed = true;
    continue;
  }

  let generated: string;
  try {
    generated = generateCommandFile(spec, id);
  } catch (err) {
    console.error(`  ✗ Failed to generate ${id}-commands.ts: ${err}`);
    anyFailed = true;
    continue;
  }

  const existing = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
  const isGenerated = existing?.includes("// BEGIN:PRIM:CLI") ?? false;
  const isNew = existing === null;
  const changed = existing !== generated;

  if (CHECK_MODE) {
    if (isNew) {
      // New file doesn't exist yet — not a check failure
      console.log(`  – packages/keystore/src/${id}-commands.ts (new — run pnpm gen:cli)`);
    } else if (!isGenerated) {
      console.log(`  – packages/keystore/src/${id}-commands.ts (manually maintained, skipped)`);
    } else if (changed) {
      console.error(
        `  ✗ packages/keystore/src/${id}-commands.ts is out of date — run pnpm gen:cli`,
      );
      anyFailed = true;
    } else {
      console.log(`  ✓ packages/keystore/src/${id}-commands.ts`);
    }
  } else {
    if (!isNew && !isGenerated) {
      console.log(`  – packages/keystore/src/${id}-commands.ts (manually maintained — skipping)`);
      console.log(`    Tip: add "// BEGIN:PRIM:CLI" as first line to opt in to generation`);
    } else {
      writeFileSync(outPath, generated);
      console.log(`  ${changed ? "↺" : "✓"} packages/keystore/src/${id}-commands.ts`);
    }
  }
}

if (CHECK_MODE && anyFailed) {
  console.error("\nSome generated files are out of date. Run: pnpm gen:cli");
  process.exit(1);
} else {
  console.log("\nDone.");
}
