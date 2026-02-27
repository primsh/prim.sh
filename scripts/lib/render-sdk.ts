/**
 * scripts/lib/render-sdk.ts — Pure render function for SDK client generation
 *
 * Takes a parsed OpenAPI spec and prim id, returns a complete TypeScript file as string.
 */

// ── OpenAPI types ──────────────────────────────────────────────────────────

interface OpenApiProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  items?: OpenApiProperty;
  properties?: Record<string, OpenApiProperty>;
  required?: string[];
  oneOf?: OpenApiProperty[];
  allOf?: OpenApiProperty[];
  $ref?: string;
  additionalProperties?: boolean | OpenApiProperty;
  pattern?: string;
  minimum?: number;
  maximum?: number;
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
  responses?: Record<string, {
    description?: string;
    content?: Record<string, { schema?: OpenApiSchema }>;
  }>;
}

export interface OpenApiSpec {
  info: { title: string; version: string };
  servers?: Array<{ url: string }>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
}

// Operations to skip (free/health endpoints)
const SKIP_OPERATIONS = new Set([
  "healthCheck",
  "getLlmsTxt",
  "llmsTxt",
]);

// ── $ref resolution ────────────────────────────────────────────────────────

function refName(ref: string): string {
  // "#/components/schemas/Foo" → "Foo"
  return ref.split("/").pop()!;
}

function resolveSchema(spec: OpenApiSpec, schema: OpenApiSchema): OpenApiSchema {
  if (schema.$ref) {
    const name = refName(schema.$ref);
    return spec.components?.schemas?.[name] ?? schema;
  }
  return schema;
}

// ── Type rendering ─────────────────────────────────────────────────────────

function pascalCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Convert an OpenAPI type reference to a TypeScript type string */
function schemaToTsType(spec: OpenApiSpec, schema: OpenApiProperty, indent = 2): string {
  if (schema.$ref) {
    return refName(schema.$ref);
  }

  // oneOf → union
  if (schema.oneOf) {
    const types = schema.oneOf.map((s) => {
      if (s.type === "null") return "null";
      return schemaToTsType(spec, s, indent);
    });
    return types.join(" | ");
  }

  // enum → string literal union
  if (schema.enum) {
    return schema.enum.map((v) => typeof v === "string" ? `"${v}"` : String(v)).join(" | ");
  }

  const type = schema.type;

  // Nullable: type: [string, "null"]
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== "null");
    const baseType = nonNull.length === 1 ? nonNull[0] : "unknown";
    const tsBase = primitiveToTs(baseType);
    return type.includes("null") ? `${tsBase} | null` : tsBase;
  }

  if (type === "array") {
    if (schema.items) {
      const itemType = schemaToTsType(spec, schema.items, indent);
      return `${itemType}[]`;
    }
    return "unknown[]";
  }

  if (type === "object") {
    if (schema.properties) {
      return renderInlineObject(spec, schema, indent);
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      const valType = schemaToTsType(spec, schema.additionalProperties, indent);
      return `Record<string, ${valType}>`;
    }
    return "Record<string, unknown>";
  }

  if (type) {
    return primitiveToTs(type);
  }

  return "unknown";
}

function primitiveToTs(t: string): string {
  if (t === "integer" || t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t === "string") return "string";
  if (t === "null") return "null";
  return "unknown";
}

function renderInlineObject(spec: OpenApiSpec, schema: OpenApiProperty, indent: number): string {
  const props = schema.properties ?? {};
  const req = new Set(schema.required ?? []);
  const pad = " ".repeat(indent);
  const lines: string[] = ["{"];
  for (const [key, val] of Object.entries(props)) {
    const opt = req.has(key) ? "" : "?";
    const tsType = schemaToTsType(spec, val, indent + 2);
    lines.push(`${pad}  ${key}${opt}: ${tsType};`);
  }
  lines.push(`${pad}}`);
  return lines.join("\n");
}

// ── allOf flattening ───────────────────────────────────────────────────────

/** Merge allOf sub-schemas into a single flat schema with combined properties/required */
function flattenAllOf(spec: OpenApiSpec, schema: OpenApiSchema): OpenApiSchema {
  if (!schema.allOf) return schema;
  const mergedProps: Record<string, OpenApiProperty> = {};
  const mergedRequired: string[] = [];
  for (const sub of schema.allOf) {
    const resolved = sub.$ref ? resolveSchema(spec, sub) : sub;
    if (resolved.properties) {
      Object.assign(mergedProps, resolved.properties);
    }
    if (resolved.required) {
      mergedRequired.push(...resolved.required);
    }
    // Recurse if nested allOf
    if (resolved.allOf) {
      const nested = flattenAllOf(spec, resolved);
      if (nested.properties) Object.assign(mergedProps, nested.properties);
      if (nested.required) mergedRequired.push(...nested.required);
    }
  }
  return {
    ...schema,
    type: "object",
    properties: mergedProps,
    required: [...new Set(mergedRequired)],
  };
}

// ── Interface rendering ────────────────────────────────────────────────────

function renderInterface(spec: OpenApiSpec, name: string, schema: OpenApiSchema): string {
  const flat = flattenAllOf(spec, schema);
  const props = flat.properties ?? {};
  const req = new Set(flat.required ?? []);
  const lines: string[] = [];
  lines.push(`export interface ${name} {`);
  for (const [key, val] of Object.entries(props)) {
    const opt = req.has(key) ? "" : "?";
    const desc = val.description?.split("\n")[0];
    if (desc) {
      lines.push(`  /** ${desc.trim()} */`);
    }
    const tsType = schemaToTsType(spec, val, 2);
    lines.push(`  ${key}${opt}: ${tsType};`);
  }
  lines.push("}");
  return lines.join("\n");
}

// ── Method rendering ───────────────────────────────────────────────────────

interface MethodInfo {
  operationId: string;
  httpMethod: string;
  path: string;
  bodyType: string | null;    // JSON request body type (from requestBody)
  paramsType: string | null;  // Path/query params type (generated)
  responseType: string;
  pathParams: string[];
  queryParams: Array<{ name: string; required: boolean }>;
  hasJsonBody: boolean;
  hasBinaryBody: boolean;
}

function extractMethods(spec: OpenApiSpec): MethodInfo[] {
  const methods: MethodInfo[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [httpMethod, op] of Object.entries(pathItem as Record<string, OpenApiOperation>)) {
      if (!op.operationId) continue;
      if (SKIP_OPERATIONS.has(op.operationId)) continue;

      const pathParams: string[] = [];
      const queryParams: Array<{ name: string; required: boolean }> = [];

      for (const param of op.parameters ?? []) {
        if (param.in === "path") pathParams.push(param.name);
        if (param.in === "query") queryParams.push({ name: param.name, required: param.required ?? false });
      }

      // Body type (from requestBody application/json)
      let bodyType: string | null = null;
      let hasJsonBody = false;

      const jsonBody = op.requestBody?.content?.["application/json"];
      if (jsonBody?.schema) {
        hasJsonBody = true;
        if (jsonBody.schema.$ref) {
          bodyType = refName(jsonBody.schema.$ref);
        } else {
          bodyType = `${pascalCase(op.operationId)}Request`;
        }
      }

      // Binary body
      const binaryBody = op.requestBody?.content?.["application/octet-stream"];
      const hasBinaryBody = !!binaryBody && !jsonBody;

      // Params type (for path/query params) — generated when there are path or query params
      let paramsType: string | null = null;
      if (pathParams.length > 0 || queryParams.length > 0) {
        paramsType = `${pascalCase(op.operationId)}Params`;
      }

      // Response type
      let responseType = "unknown";
      const successResponse = op.responses?.["200"] ?? op.responses?.["201"];
      const jsonResponse = successResponse?.content?.["application/json"];
      if (jsonResponse?.schema) {
        if (jsonResponse.schema.$ref) {
          responseType = refName(jsonResponse.schema.$ref);
        } else if (jsonResponse.schema.type === "array" && jsonResponse.schema.items?.$ref) {
          responseType = `${refName(jsonResponse.schema.items.$ref)}[]`;
        } else {
          responseType = `${pascalCase(op.operationId)}Response`;
        }
      }
      const binaryResponse = successResponse?.content?.["application/octet-stream"];
      if (binaryResponse && !jsonResponse) {
        responseType = "Response";
      }

      methods.push({
        operationId: op.operationId,
        httpMethod: httpMethod.toUpperCase(),
        path,
        bodyType,
        paramsType,
        responseType,
        pathParams,
        queryParams,
        hasJsonBody,
        hasBinaryBody,
      });
    }
  }

  return methods;
}

// ── Inline type generation for operations ──────────────────────────────────

/** Generate params interfaces for operations that have path/query params */
function renderParamsInterfaces(spec: OpenApiSpec, methods: MethodInfo[]): string[] {
  const lines: string[] = [];

  for (const m of methods) {
    if (!m.paramsType) continue;
    if (m.pathParams.length === 0 && m.queryParams.length === 0) continue;

    const pathItem = spec.paths?.[m.path];
    if (!pathItem) continue;
    const op = pathItem[m.httpMethod.toLowerCase()] as OpenApiOperation | undefined;
    if (!op) continue;

    lines.push(`export interface ${m.paramsType} {`);
    for (const param of op.parameters ?? []) {
      if (param.in !== "path" && param.in !== "query") continue;
      const opt = param.required ? "" : "?";
      const tsType = param.schema ? schemaToTsType(spec, param.schema) : "string";
      if (param.description) {
        lines.push(`  /** ${param.description.split("\n")[0].trim()} */`);
      }
      lines.push(`  ${param.name}${opt}: ${tsType};`);
    }
    lines.push("}");
    lines.push("");
  }

  return lines;
}

/** Generate inline response types for operations with inline response schemas */
function renderInlineResponseTypes(spec: OpenApiSpec, methods: MethodInfo[]): string[] {
  const lines: string[] = [];

  for (const m of methods) {
    if (m.responseType === "unknown" || m.responseType === "Response") continue;
    if (spec.components?.schemas?.[m.responseType]) continue;
    if (m.responseType.endsWith("[]")) continue;

    const pathItem = spec.paths?.[m.path];
    if (!pathItem) continue;
    const op = pathItem[m.httpMethod.toLowerCase()] as OpenApiOperation | undefined;
    if (!op) continue;

    const successResponse = op.responses?.["200"] ?? op.responses?.["201"];
    const jsonResponse = successResponse?.content?.["application/json"];
    if (!jsonResponse?.schema) continue;
    if (jsonResponse.schema.$ref) continue;

    const schema = jsonResponse.schema;
    if (schema.properties) {
      lines.push(renderInterface(spec, m.responseType, schema));
      lines.push("");
    } else if (schema.type === "object") {
      lines.push(`export type ${m.responseType} = Record<string, unknown>;`);
      lines.push("");
    }
  }

  return lines;
}

/** Generate inline request body types for operations with inline request schemas */
function renderInlineRequestTypes(spec: OpenApiSpec, methods: MethodInfo[]): string[] {
  const lines: string[] = [];

  for (const m of methods) {
    if (!m.bodyType) continue;
    if (spec.components?.schemas?.[m.bodyType]) continue;

    const pathItem = spec.paths?.[m.path];
    if (!pathItem) continue;
    const op = pathItem[m.httpMethod.toLowerCase()] as OpenApiOperation | undefined;
    if (!op) continue;

    const jsonBody = op.requestBody?.content?.["application/json"];
    if (!jsonBody?.schema) continue;
    if (jsonBody.schema.$ref) continue;

    const schema = jsonBody.schema;
    if (schema.properties) {
      lines.push(renderInterface(spec, m.bodyType, schema));
      lines.push("");
    }
  }

  return lines;
}

// ── Client method rendering ────────────────────────────────────────────────

function renderMethod(m: MethodInfo): string {
  const lines: string[] = [];
  const hasPathParams = m.pathParams.length > 0;
  const hasQueryParams = m.queryParams.length > 0;
  const hasParams = hasPathParams || hasQueryParams;

  // Build parameter signature
  const sigParts: string[] = [];
  if (hasParams && m.paramsType) {
    sigParts.push(`params: ${m.paramsType}`);
  }
  if (m.hasJsonBody && m.bodyType) {
    sigParts.push(`req: ${m.bodyType}`);
  }
  if (m.hasBinaryBody) {
    sigParts.push("body: BodyInit");
    sigParts.push("contentType?: string");
  }
  const paramSig = sigParts.join(", ");

  // Return type
  const returnType = m.responseType;
  const isRawResponse = m.responseType === "Response";

  lines.push(`    async ${m.operationId}(${paramSig}): Promise<${returnType}> {`);

  // Build URL with path param interpolation
  let urlPath = m.path;
  if (hasPathParams) {
    for (const p of m.pathParams) {
      urlPath = urlPath.replace(`{${p}}`, `\${encodeURIComponent(params.${p})}`);
    }
  }

  if (hasQueryParams) {
    lines.push(`      const qs = new URLSearchParams();`);
    for (const qp of m.queryParams) {
      lines.push(`      if (params.${qp.name} !== undefined) qs.set("${qp.name}", String(params.${qp.name}));`);
    }
    lines.push(`      const query = qs.toString();`);
    lines.push(`      const url = \`\${baseUrl}${urlPath}\${query ? \`?\${query}\` : ""}\`;`);
  } else {
    lines.push(`      const url = \`\${baseUrl}${urlPath}\`;`);
  }

  // Build fetch options
  const fetchOpts: string[] = [];

  if (m.httpMethod !== "GET") {
    fetchOpts.push(`        method: "${m.httpMethod}",`);
  }

  if (m.hasJsonBody && m.bodyType) {
    fetchOpts.push(`        headers: { "Content-Type": "application/json" },`);
    fetchOpts.push(`        body: JSON.stringify(req),`);
  } else if (m.hasBinaryBody) {
    fetchOpts.push(`        headers: contentType ? { "Content-Type": contentType } : {},`);
    fetchOpts.push(`        body,`);
  }

  if (fetchOpts.length > 0) {
    lines.push(`      const res = await primFetch(url, {`);
    lines.push(...fetchOpts);
    lines.push(`      });`);
  } else {
    lines.push(`      const res = await primFetch(url);`);
  }

  if (isRawResponse) {
    lines.push(`      return res;`);
  } else {
    lines.push(`      return res.json() as Promise<${returnType}>;`);
  }

  lines.push(`    },`);
  return lines.join("\n");
}

// ── Main render function ───────────────────────────────────────────────────

export function renderSdkClient(primId: string, spec: OpenApiSpec): string {
  const baseUrl = spec.servers?.[0]?.url ?? `https://${primId}.prim.sh`;
  const schemas = spec.components?.schemas ?? {};

  const methods = extractMethods(spec);
  const out: string[] = [];

  out.push(`// Generated by gen:sdk — do not edit by hand`);
  out.push(`// Source: specs/openapi/${primId}.yaml`);
  out.push(`// Regenerate: pnpm gen:sdk`);
  out.push(``);

  // ── Types ──────────────────────────────────────────────────────────────

  out.push(`// ── Types ──────────────────────────────────────────────────────────────────`);
  out.push(``);

  // Render named schemas from components.schemas
  for (const [name, schema] of Object.entries(schemas)) {
    if (name === "Error") continue; // Skip Error schema
    if (name === "ErrorEnvelope") continue; // Skip error envelope variants

    // Simple alias types (just a string with pattern, no properties)
    if (schema.type === "string" && !schema.properties && !schema.enum) {
      out.push(`export type ${name} = string;`);
      out.push(``);
      continue;
    }

    // Enum-only type
    if (schema.enum && !schema.properties) {
      const union = schema.enum.map((v) => typeof v === "string" ? `"${v}"` : String(v)).join(" | ");
      out.push(`export type ${name} = ${union};`);
      out.push(``);
      continue;
    }

    if (schema.allOf) {
      // allOf composition — flatten and render as interface
      out.push(renderInterface(spec, name, schema));
      out.push(``);
    } else if (schema.properties) {
      out.push(renderInterface(spec, name, schema));
      out.push(``);
    } else if (schema.type === "object") {
      // Bare object with no properties — emit as Record<string, unknown>
      out.push(`export type ${name} = Record<string, unknown>;`);
      out.push(``);
    }
  }

  // Render inline request body types
  const inlineReqTypes = renderInlineRequestTypes(spec, methods);
  if (inlineReqTypes.length > 0) {
    out.push(...inlineReqTypes);
  }

  // Render params interfaces for path/query param methods
  const paramsInterfaces = renderParamsInterfaces(spec, methods);
  if (paramsInterfaces.length > 0) {
    out.push(...paramsInterfaces);
  }

  // Render inline response types
  const inlineRespTypes = renderInlineResponseTypes(spec, methods);
  if (inlineRespTypes.length > 0) {
    out.push(...inlineRespTypes);
  }

  // ── Client ─────────────────────────────────────────────────────────────

  out.push(`// ── Client ─────────────────────────────────────────────────────────────────`);
  out.push(``);

  const clientName = `create${pascalCase(primId)}Client`;
  out.push(`export function ${clientName}(primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {`);
  out.push(`  const baseUrl = "${baseUrl}";`);
  out.push(`  return {`);

  for (const m of methods) {
    out.push(renderMethod(m));
  }

  out.push(`  };`);
  out.push(`}`);
  out.push(``);

  return out.join("\n");
}
