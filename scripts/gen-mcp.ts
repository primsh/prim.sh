#!/usr/bin/env bun
/**
 * gen-mcp.ts — MCP tool generator
 *
 * Reads specs/openapi/<id>.yaml and generates packages/mcp/src/tools/<id>.ts.
 * OpenAPI is the single source of truth for tool names, descriptions, and schemas.
 *
 * Usage:
 *   bun scripts/gen-mcp.ts           # regenerate all tool files
 *   bun scripts/gen-mcp.ts --check   # diff against disk, exit 1 if any file would change
 *
 * Marker-bounded generation:
 *   // BEGIN:GENERATED:TOOLS ... // END:GENERATED:TOOLS  — Tool[] export
 *   // BEGIN:GENERATED:HANDLER ... // END:GENERATED:HANDLER — handler function
 *
 *   Content outside markers is preserved on re-run.
 *   Files without markers are fully written on first run.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { primsForInterface } from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");
const SPECS_DIR = join(ROOT, "specs/openapi");
const TOOLS_DIR = join(ROOT, "packages/mcp/src/tools");
const CHECK_MODE = process.argv.includes("--check");

let anyFailed = false;

// ── OpenAPI types (minimal) ────────────────────────────────────────────────

interface OpenApiSchema {
  type?: string | string[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  enum?: unknown[];
  format?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  pattern?: string;
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  $ref?: string;
  // additional fields preserved as-is
  [key: string]: unknown;
}

interface OpenApiParameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  "x-price"?: string;
  security?: unknown[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: {
      "application/json"?: {
        schema?: OpenApiSchema;
      };
    };
  };
  responses?: Record<string, unknown>;
}

interface OpenApiPath {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
}

interface OpenApiSpec {
  info: { title: string; version: string };
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
  paths: Record<string, OpenApiPath>;
}

// ── Supported prims ────────────────────────────────────────────────────────

const PRIMS = primsForInterface("mcp").map((p) => p.id);

// ── $ref resolver ──────────────────────────────────────────────────────────

function resolveRef(ref: string, spec: OpenApiSpec): OpenApiSchema {
  // Only handles local refs: #/components/schemas/Foo
  const parts = ref.replace(/^#\//, "").split("/");
  let cur: unknown = spec;
  for (const part of parts) {
    cur = (cur as Record<string, unknown>)[part];
    if (cur === undefined) throw new Error(`Cannot resolve $ref: ${ref}`);
  }
  return cur as OpenApiSchema;
}

function resolveSchema(schema: OpenApiSchema, spec: OpenApiSpec, depth = 0): OpenApiSchema {
  if (depth > 10) return schema; // guard against circular refs
  if (schema.$ref) {
    return resolveSchema(resolveRef(schema.$ref, spec), spec, depth + 1);
  }
  // Deep-resolve nested schemas
  const result: OpenApiSchema = { ...schema };
  if (result.properties) {
    const resolved: Record<string, OpenApiSchema> = {};
    for (const [k, v] of Object.entries(result.properties)) {
      resolved[k] = resolveSchema(v, spec, depth + 1);
    }
    result.properties = resolved;
  }
  if (result.items) result.items = resolveSchema(result.items, spec, depth + 1);
  if (result.oneOf) result.oneOf = result.oneOf.map((s) => resolveSchema(s, spec, depth + 1));
  if (result.anyOf) result.anyOf = result.anyOf.map((s) => resolveSchema(s, spec, depth + 1));
  return result;
}

// ── Schema serialization ───────────────────────────────────────────────────

/**
 * Serialize an OpenAPI schema object to a TypeScript object literal string.
 * Strips 'example' and 'examples' fields (not part of JSON Schema / MCP).
 */
function serializeSchema(schema: OpenApiSchema, indent: number): string {
  const pad = " ".repeat(indent);
  const innerPad = " ".repeat(indent + 2);

  const SKIP_KEYS = new Set(["example", "examples", "$ref"]);

  const entries: string[] = [];

  // Ensure 'type' comes first for readability
  if (schema.type !== undefined) {
    entries.push(`${innerPad}type: ${JSON.stringify(schema.type)}`);
  }

  for (const [key, value] of Object.entries(schema)) {
    if (SKIP_KEYS.has(key) || key === "type") continue;
    if (value === undefined) continue;

    if (key === "properties" && typeof value === "object" && value !== null) {
      const props = value as Record<string, OpenApiSchema>;
      const propEntries = Object.entries(props);
      if (propEntries.length === 0) {
        entries.push(`${innerPad}properties: {}`);
      } else {
        const propLines = propEntries
          .map(
            ([pk, pv]) => `${innerPad}  ${JSON.stringify(pk)}: ${serializeSchema(pv, indent + 4)}`,
          )
          .join(",\n");
        entries.push(`${innerPad}properties: {\n${propLines},\n${innerPad}}`);
      }
    } else if (key === "items" && typeof value === "object" && value !== null) {
      entries.push(`${innerPad}items: ${serializeSchema(value as OpenApiSchema, indent + 2)}`);
    } else if (key === "oneOf" || key === "anyOf") {
      const arr = value as OpenApiSchema[];
      const lines = arr.map((s) => `${innerPad}  ${serializeSchema(s, indent + 4)}`).join(",\n");
      entries.push(`${innerPad}${key}: [\n${lines},\n${innerPad}]`);
    } else if (key === "required" && Array.isArray(value)) {
      entries.push(`${innerPad}required: ${JSON.stringify(value)}`);
    } else if (key === "enum" && Array.isArray(value)) {
      entries.push(`${innerPad}enum: ${JSON.stringify(value)}`);
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      entries.push(`${innerPad}${key}: ${JSON.stringify(value)}`);
    } else if (Array.isArray(value)) {
      entries.push(`${innerPad}${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === "object" && value !== null) {
      entries.push(`${innerPad}${key}: ${serializeSchema(value as OpenApiSchema, indent + 2)}`);
    }
  }

  if (entries.length === 0) return "{}";
  return `{\n${entries.join(",\n")},\n${pad}}`;
}

// ── Name helpers ───────────────────────────────────────────────────────────

/**
 * Convert operationId (camelCase) to tool name (<prim>_snake_case).
 * e.g. "searchWeb" → "search_web", "listTokens" → "token_list"
 */
function operationIdToToolName(operationId: string, prim: string): string {
  // Convert camelCase to snake_case
  const snake = operationId
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");

  // If it already starts with prim_, keep as-is; otherwise prepend prim_
  if (snake.startsWith(`${prim}_`)) return snake;
  return `${prim}_${snake}`;
}

/** Capitalize first letter */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** handler function name: handle<Prim>Tool */
function handlerFnName(prim: string): string {
  return `handle${capitalize(prim)}Tool`;
}

/** tools export name: <prim>Tools */
function toolsExportName(prim: string): string {
  return `${prim}Tools`;
}

// ── Path parameter extraction ──────────────────────────────────────────────

/** Extract {param} names from a path template */
function extractPathParams(path: string): string[] {
  return Array.from(path.matchAll(/\{([^}]+)\}/g)).map((m) => m[1]);
}

/** Fill a path template with args references: /v1/wallets/{address} → `${baseUrl}/v1/wallets/${args.address}` */
function fillPathTemplate(path: string, pathParams: string[]): string {
  let filled = path;
  for (const p of pathParams) {
    filled = filled.replace(`{${p}}`, `\${args.${p}}`);
  }
  return `\`\${baseUrl}${filled}\``;
}

// ── Handler code generation ────────────────────────────────────────────────

interface Operation {
  toolName: string;
  method: string;
  path: string;
  pathParams: string[];
  queryParams: OpenApiParameter[];
  hasBody: boolean;
  bodySchema: OpenApiSchema | null;
}

function genCaseBody(op: Operation, prim: string, indent: string): string {
  const { method, pathParams, queryParams, hasBody } = op;
  const urlExpr = fillPathTemplate(op.path, pathParams);
  const lines: string[] = [];
  const i = `${indent}  `;

  // Determine non-path, non-query body params (for POST/PUT/PATCH)
  // Body params are everything that's not a path or query param
  const nonBodyParams = new Set([...pathParams, ...queryParams.map((q) => q.name)]);

  if (method === "GET" || method === "DELETE") {
    if (queryParams.length > 0) {
      // Use URL object for query params
      lines.push(`${i}const url = new URL(${urlExpr});`);
      for (const qp of queryParams) {
        if (qp.required) {
          lines.push(
            `${i}url.searchParams.set(${JSON.stringify(qp.name)}, String(args.${qp.name}));`,
          );
        } else {
          lines.push(
            `${i}if (args.${qp.name} !== undefined) url.searchParams.set(${JSON.stringify(qp.name)}, String(args.${qp.name}));`,
          );
        }
      }
      if (method === "GET") {
        lines.push(`${i}const res = await primFetch(url.toString());`);
      } else {
        lines.push(`${i}const res = await primFetch(url.toString(), { method: "DELETE" });`);
      }
    } else if (method === "DELETE") {
      lines.push(`${i}const res = await primFetch(${urlExpr}, { method: "DELETE" });`);
    } else {
      lines.push(`${i}const res = await primFetch(${urlExpr});`);
    }
  } else {
    // POST, PUT, PATCH
    if (hasBody) {
      // Body consists of all args that aren't path params
      if (pathParams.length > 0) {
        // Destructure path params out, rest goes to body
        const destructure = pathParams.map((p) => p).join(", ");
        const restName = pathParams.length === 1 ? "body" : "body";
        lines.push(`${i}const { ${destructure}, ...${restName} } = args;`);
        lines.push(`${i}const res = await primFetch(${urlExpr}, {`);
        lines.push(`${i}  method: ${JSON.stringify(method)},`);
        lines.push(`${i}  headers: { "Content-Type": "application/json" },`);
        lines.push(`${i}  body: JSON.stringify(${restName}),`);
        lines.push(`${i}});`);
      } else {
        lines.push(`${i}const res = await primFetch(${urlExpr}, {`);
        lines.push(`${i}  method: ${JSON.stringify(method)},`);
        lines.push(`${i}  headers: { "Content-Type": "application/json" },`);
        lines.push(`${i}  body: JSON.stringify(args),`);
        lines.push(`${i}});`);
      }
    } else {
      // No body (e.g., POST action with no request body)
      lines.push(
        `${i}const res = await primFetch(${urlExpr}, { method: ${JSON.stringify(method)} });`,
      );
    }
  }

  lines.push(`${i}const data = await res.json();`);
  lines.push(`${i}if (!res.ok) return errorResult(data);`);
  lines.push(`${i}return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };`);

  return lines.join("\n");
}

// ── Tool definition generation ─────────────────────────────────────────────

interface ToolDef {
  toolName: string;
  description: string;
  inputSchema: OpenApiSchema;
}

function buildDescription(op: OpenApiOperation, xPrice: string | undefined): string {
  const base = (op.summary ?? "").trim();
  if (xPrice) {
    return `${base} | Price: ${xPrice}`;
  }
  return base;
}

function buildInputSchema(
  operation: OpenApiOperation,
  pathParams: string[],
  spec: OpenApiSpec,
): OpenApiSchema {
  const schema: OpenApiSchema = {
    type: "object",
    properties: {},
    required: [] as string[],
  };

  // 1. Add path parameters
  for (const paramName of pathParams) {
    const paramDef = operation.parameters?.find((p) => p.name === paramName && p.in === "path");
    const paramSchema = paramDef?.schema
      ? resolveSchema(paramDef.schema, spec)
      : { type: "string" };
    const desc = paramDef?.description;
    (schema.properties as Record<string, OpenApiSchema>)[paramName] = desc
      ? { ...paramSchema, description: desc }
      : paramSchema;
    (schema.required as string[]).push(paramName);
  }

  // 2. Add query parameters
  if (operation.parameters) {
    for (const param of operation.parameters) {
      if (param.in !== "query") continue;
      const paramSchema = param.schema ? resolveSchema(param.schema, spec) : { type: "string" };
      const resolved: OpenApiSchema = { ...paramSchema };
      if (param.description) resolved.description = param.description;
      (schema.properties as Record<string, OpenApiSchema>)[param.name] = resolved;
      if (param.required) (schema.required as string[]).push(param.name);
    }
  }

  // 3. Merge request body schema properties
  const bodySchema = operation.requestBody?.content?.["application/json"]?.schema;
  if (bodySchema) {
    const resolved = resolveSchema(bodySchema, spec);
    if (resolved.properties) {
      for (const [key, val] of Object.entries(resolved.properties)) {
        if (!(schema.properties as Record<string, OpenApiSchema>)[key]) {
          (schema.properties as Record<string, OpenApiSchema>)[key] = val;
        }
      }
    }
    if (resolved.required) {
      const existingRequired = new Set(schema.required as string[]);
      for (const r of resolved.required) {
        if (!existingRequired.has(r)) {
          (schema.required as string[]).push(r);
        }
      }
    }
    // If body is not an object with properties (e.g., direct schema), use it as-is
    // But merge path params on top
    if (!resolved.properties && pathParams.length === 0 && !operation.parameters?.length) {
      return resolved;
    }
  }

  // Clean up empty required array
  if ((schema.required as string[]).length === 0) {
    schema.required = undefined;
  }

  return schema;
}

// ── File generation ────────────────────────────────────────────────────────

interface GeneratedSection {
  toolsDef: string;
  handlerDef: string;
}

function generateSections(prim: string, spec: OpenApiSpec): GeneratedSection {
  const SKIP_OP_IDS = new Set(["healthCheck", "getLlmsTxt"]);

  const toolDefs: ToolDef[] = [];
  const operations: Operation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const op = pathItem[method];
      if (!op?.operationId) continue;
      if (SKIP_OP_IDS.has(op.operationId)) continue;

      const pathParams = extractPathParams(path);
      const queryParams = (op.parameters ?? []).filter((p) => p.in === "query");
      const hasBody = !!op.requestBody?.content?.["application/json"];
      const bodySchema = hasBody
        ? resolveSchema(op.requestBody?.content?.["application/json"]?.schema ?? {}, spec)
        : null;

      const toolName = operationIdToToolName(op.operationId, prim);
      const xPrice = op["x-price"] as string | undefined;
      const description = buildDescription(op, xPrice);
      const inputSchema = buildInputSchema(op, pathParams, spec);

      toolDefs.push({ toolName, description, inputSchema });
      operations.push({
        toolName,
        method: method.toUpperCase(),
        path,
        pathParams,
        queryParams,
        hasBody,
        bodySchema,
      });
    }
  }

  // --- Tools section ---
  const toolLines: string[] = [];
  for (const { toolName, description, inputSchema } of toolDefs) {
    const schemaStr = serializeSchema(inputSchema, 6);
    toolLines.push("  {");
    toolLines.push(`    name: ${JSON.stringify(toolName)},`);
    toolLines.push(`    description: ${JSON.stringify(description)},`);
    toolLines.push(`    inputSchema: ${schemaStr},`);
    toolLines.push("  },");
  }

  const toolsName = toolsExportName(prim);
  const toolsDef = [`export const ${toolsName}: Tool[] = [`, ...toolLines, "];"].join("\n");

  // --- Handler section ---
  const handlerName = handlerFnName(prim);

  // Determine if we need primFetch (most prims do, faucet doesn't)
  const needsPrimFetch = prim !== "faucet";
  const fetchParam = needsPrimFetch
    ? "primFetch: typeof fetch,\n  baseUrl: string,"
    : "baseUrl: string,";
  const fetchArg = needsPrimFetch ? "primFetch" : "fetch";

  const caseBlocks: string[] = [];
  for (const op of operations) {
    // Replace primFetch with fetchArg in case body generation
    const caseBody = genCaseBody(op, prim, "      ");
    caseBlocks.push(`      case ${JSON.stringify(op.toolName)}: {`);
    caseBlocks.push(caseBody.replace(/primFetch/g, fetchArg));
    caseBlocks.push("      }");
    caseBlocks.push("");
  }

  const handlerDef = [
    `export async function ${handlerName}(`,
    "  name: string,",
    "  args: Record<string, unknown>,",
    `  ${fetchParam}`,
    "): Promise<CallToolResult> {",
    "  try {",
    "    switch (name) {",
    ...caseBlocks,
    "      default:",
    "        return {",
    `          content: [{ type: "text", text: \`Unknown ${prim} tool: \${name}\` }],`,
    "          isError: true,",
    "        };",
    "    }",
    "  } catch (err) {",
    "    return {",
    "      content: [",
    `        { type: "text", text: \`Error: \${err instanceof Error ? err.message : String(err)}\` },`,
    "      ],",
    "      isError: true,",
    "    };",
    "  }",
    "}",
    "",
    "function errorResult(data: unknown): CallToolResult {",
    "  return {",
    `    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],`,
    "    isError: true,",
    "  };",
    "}",
  ].join("\n");

  return { toolsDef, handlerDef };
}

function buildFullFile(prim: string, toolsDef: string, handlerDef: string): string {
  return [
    `import type { Tool } from "@modelcontextprotocol/sdk/types.js";`,
    `import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";`,
    "",
    "// BEGIN:GENERATED:TOOLS",
    toolsDef,
    "// END:GENERATED:TOOLS",
    "",
    "// BEGIN:GENERATED:HANDLER",
    handlerDef,
    "// END:GENERATED:HANDLER",
    "",
  ].join("\n");
}

function injectMarkers(existing: string, toolsDef: string, handlerDef: string): string {
  let result = existing;

  // Inject TOOLS section
  const toolsOpen = "// BEGIN:GENERATED:TOOLS";
  const toolsClose = "// END:GENERATED:TOOLS";
  const toolsOpenIdx = result.indexOf(toolsOpen);
  const toolsCloseIdx = result.indexOf(toolsClose);
  if (toolsOpenIdx !== -1 && toolsCloseIdx !== -1) {
    const before = result.slice(0, toolsOpenIdx + toolsOpen.length);
    const after = result.slice(toolsCloseIdx);
    result = `${before}\n${toolsDef}\n${after}`;
  }

  // Re-find HANDLER markers after TOOLS injection
  const handlerOpen = "// BEGIN:GENERATED:HANDLER";
  const handlerClose = "// END:GENERATED:HANDLER";
  const handlerOpenIdx = result.indexOf(handlerOpen);
  const handlerCloseIdx = result.indexOf(handlerClose);
  if (handlerOpenIdx !== -1 && handlerCloseIdx !== -1) {
    const before = result.slice(0, handlerOpenIdx + handlerOpen.length);
    const after = result.slice(handlerCloseIdx);
    result = `${before}\n${handlerDef}\n${after}`;
  }

  return result;
}

function applyOrCheck(filePath: string, content: string, label: string): void {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  const changed = existing !== content;

  if (CHECK_MODE) {
    if (changed) {
      console.error(`  ✗ ${label} is out of date — run pnpm gen:mcp`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${label}`);
    }
  } else {
    writeFileSync(filePath, content);
    console.log(`  ${changed ? "↺" : "✓"} ${label}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log(CHECK_MODE ? "Mode: check\n" : "Mode: generate\n");

for (const prim of PRIMS) {
  const specPath = join(SPECS_DIR, `${prim}.yaml`);
  const outPath = join(TOOLS_DIR, `${prim}.ts`);

  if (!existsSync(specPath)) {
    console.log(`  – ${prim}.ts (no OpenAPI spec, skipped)`);
    continue;
  }

  let spec: OpenApiSpec;
  try {
    const raw = readFileSync(specPath, "utf8");
    spec = parseYaml(raw) as OpenApiSpec;
  } catch (err) {
    console.error(`  ✗ ${prim}.yaml parse error: ${err}`);
    anyFailed = true;
    continue;
  }

  const { toolsDef, handlerDef } = generateSections(prim, spec);

  let finalContent: string;
  const existing = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;

  if (existing?.includes("// BEGIN:GENERATED:TOOLS")) {
    // File already has markers — inject into existing file
    finalContent = injectMarkers(existing, toolsDef, handlerDef);
  } else {
    // First run — write full file
    finalContent = buildFullFile(prim, toolsDef, handlerDef);
  }

  applyOrCheck(outPath, finalContent, `packages/mcp/src/tools/${prim}.ts`);
}

if (CHECK_MODE && anyFailed) {
  console.error("\nSome MCP tool files are out of date. Run: pnpm gen:mcp");
  process.exit(1);
} else if (CHECK_MODE) {
  console.log("\nAll MCP tool files are up to date.");
} else {
  console.log("\nDone.");
}
