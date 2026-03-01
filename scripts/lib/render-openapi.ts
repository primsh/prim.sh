// SPDX-License-Identifier: Apache-2.0
/**
 * scripts/lib/render-openapi.ts — OpenAPI 3.1 spec renderer
 *
 * Pure render function. Takes a Primitive, ParsedApi, and route prices,
 * returns a complete OpenAPI 3.1 YAML string. No I/O.
 */

import { stringify } from "yaml";
import type { ParsedApi, ParsedInterface } from "./parse-api.js";
import type { Primitive, RouteMapping } from "./primitives.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Schema = Record<string, unknown>;

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function extractPathParams(route: string): string[] {
  const params: string[] = [];
  const re = /:([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(route)) !== null) {
    params.push(m[1]);
  }
  return params;
}

function lookupPrice(route: string, prices: Map<string, string>): string | null {
  // biome-ignore lint/style/noNonNullAssertion: guarded by .has() check
  if (prices.has(route)) return prices.get(route)!;
  const bracketForm = route.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "[$1]");
  // biome-ignore lint/style/noNonNullAssertion: guarded by .has() check
  if (prices.has(bracketForm)) return prices.get(bracketForm)!;
  const method = route.split(" ")[0];
  const path = route.split(" ").slice(1).join(" ");
  const pathParts = path.split("/");
  for (const [key, val] of prices) {
    const km = key.split(" ")[0];
    if (km !== method) continue;
    const kp = key.split(" ").slice(1).join(" ");
    const kParts = kp.split("/");
    if (kParts.length !== pathParts.length) continue;
    let match = true;
    for (let i = 0; i < pathParts.length; i++) {
      const pp = pathParts[i];
      const kk = kParts[i];
      if (!pp.startsWith(":") && !kk.startsWith("[") && kk !== "*") {
        if (pp !== kk) {
          match = false;
          break;
        }
      }
    }
    if (match) return val;
  }
  return null;
}

// ── Union splitting ─────────────────────────────────────────────────────────

/** Split a union type string at top-level `|` separators, respecting nesting. */
function splitUnion(typeStr: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < typeStr.length; i++) {
    const ch = typeStr[i];
    if (inString) {
      current += ch;
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "<") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === ">") {
      depth--;
      current += ch;
      continue;
    }
    if (ch === "|" && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// ── Type → OpenAPI schema ────────────────────────────────────────────────────

function typeToSchema(typeStr: string, interfaces: Map<string, ParsedInterface>): Schema {
  // biome-ignore lint/style/noParameterAssign: local mutation for convenience
  typeStr = typeStr.trim();

  if (typeStr === "object" || typeStr.startsWith("{")) return { type: "object" };
  if (typeStr === "string") return { type: "string" };
  if (typeStr === "number") return { type: "number" };
  if (typeStr === "boolean") return { type: "boolean" };

  // Union types — checked BEFORE literal/array to handle "a" | "b" and string | string[]
  if (typeStr.includes("|")) {
    const parts = splitUnion(typeStr);
    const hasNull = parts.some((p) => p === "null");
    const nonNullParts = parts.filter((p) => p !== "null");

    // All string literals (possibly nullable)
    const allLiterals = nonNullParts.every(
      (p) => (p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'")),
    );
    if (allLiterals && nonNullParts.length > 0) {
      const values = nonNullParts.map((p) => p.slice(1, -1));
      const enumSchema: Schema = { type: "string", enum: values };
      if (hasNull) return { oneOf: [enumSchema, { type: "null" }] };
      return enumSchema;
    }

    // Simple nullable: X | null
    if (hasNull && nonNullParts.length === 1) {
      const inner = typeToSchema(nonNullParts[0], interfaces);
      if (inner.$ref) return { oneOf: [inner, { type: "null" }] };
      if (typeof inner.type === "string") return { type: [inner.type, "null"] };
      return { oneOf: [inner, { type: "null" }] };
    }

    // General union: group string literals together, map the rest
    const stringLiterals: string[] = [];
    const otherSchemas: Schema[] = [];
    for (const p of parts) {
      if (p === "null") {
        otherSchemas.push({ type: "null" });
      } else if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
        stringLiterals.push(p.slice(1, -1));
      } else {
        otherSchemas.push(typeToSchema(p, interfaces));
      }
    }
    const schemas: Schema[] = [];
    if (stringLiterals.length > 0) schemas.push({ type: "string", enum: stringLiterals });
    schemas.push(...otherSchemas);
    if (schemas.length === 1) return schemas[0];
    return { oneOf: schemas };
  }

  // Single string literal: "list", "function", etc.
  if (
    (typeStr.startsWith('"') && typeStr.endsWith('"')) ||
    (typeStr.startsWith("'") && typeStr.endsWith("'"))
  ) {
    return { type: "string", enum: [typeStr.slice(1, -1)] };
  }

  // Array type: Foo[] or string[]
  if (typeStr.endsWith("[]")) {
    return { type: "array", items: typeToSchema(typeStr.slice(0, -2), interfaces) };
  }

  // Known interface reference (exclude error types — mapped to standard Error schema)
  if (interfaces.has(typeStr) && typeStr !== "ApiError" && typeStr !== "ApiErrorDetail") {
    return { $ref: `#/components/schemas/${typeStr}` };
  }

  // Fallback
  return { type: "string" };
}

// ── Interface reference collection ──────────────────────────────────────────

function extractInterfaceRefs(typeStr: string, interfaces: Map<string, ParsedInterface>): string[] {
  const tokens = typeStr.split(/[^A-Za-z_$0-9]+/).filter(Boolean);
  return tokens.filter((t) => interfaces.has(t) && t !== "ApiError" && t !== "ApiErrorDetail");
}

function collectReferencedInterfaces(
  rootTypes: string[],
  interfaces: Map<string, ParsedInterface>,
): Set<string> {
  const visited = new Set<string>();
  const queue = [...rootTypes];
  while (queue.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: queue is non-empty per while condition
    const name = queue.pop()!;
    if (visited.has(name) || !interfaces.has(name)) continue;
    if (name === "ApiError" || name === "ApiErrorDetail") continue;
    visited.add(name);
    // biome-ignore lint/style/noNonNullAssertion: guarded by .has() check above
    const iface = interfaces.get(name)!;
    for (const field of iface.fields) {
      for (const ref of extractInterfaceRefs(field.type, interfaces)) {
        if (!visited.has(ref)) queue.push(ref);
      }
    }
    if (iface.extends) {
      for (const ref of extractInterfaceRefs(iface.extends, interfaces)) {
        if (!visited.has(ref)) queue.push(ref);
      }
    }
  }
  return visited;
}

// ── Interface → schema ──────────────────────────────────────────────────────

function interfaceToSchema(
  iface: ParsedInterface,
  interfaces: Map<string, ParsedInterface>,
): Schema {
  let allFields = iface.fields;
  if (iface.extends) {
    const parent = interfaces.get(iface.extends);
    if (parent) allFields = [...parent.fields, ...iface.fields];
  }
  if (allFields.length === 0) return { type: "object" };

  const required = allFields.filter((f) => !f.optional).map((f) => f.name);
  const properties: Record<string, Schema> = {};
  for (const field of allFields) {
    const schema = typeToSchema(field.type, interfaces);
    properties[field.name] = field.description
      ? { ...schema, description: field.description }
      : schema;
  }

  const result: Schema = { type: "object" };
  if (required.length > 0) result.required = required;
  result.properties = properties;
  return result;
}

// ── Schema builders ─────────────────────────────────────────────────────────

function buildSchemas(api: ParsedApi, referenced: Set<string>): Record<string, Schema> {
  const schemas: Record<string, Schema> = {};

  schemas.Error = {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: {
            type: "string",
            ...(api.errorCodes.length > 0 ? { enum: api.errorCodes } : {}),
            description: "Machine-readable error code.",
          },
          message: {
            type: "string",
            description: "Human-readable error message.",
          },
        },
      },
    },
  };

  for (const name of [...referenced].sort()) {
    // biome-ignore lint/style/noNonNullAssertion: name comes from referenced set which was built from interfaces keys
    const iface = api.interfaces.get(name)!;
    schemas[name] = interfaceToSchema(iface, api.interfaces);
  }

  return schemas;
}

// ── Path builders ───────────────────────────────────────────────────────────

function buildHealthCheck(p: Primitive): Schema {
  return {
    get: {
      operationId: "healthCheck",
      summary: "Health check",
      description: "Returns service status. Free — no x402 payment required.",
      security: [],
      responses: {
        "200": {
          description: "Service is running.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["service", "status"],
                properties: {
                  service: { type: "string", example: `${p.id}.sh` },
                  status: { type: "string", example: "ok" },
                },
              },
            },
          },
        },
      },
    },
  };
}

function buildOperation(
  rm: RouteMapping,
  api: ParsedApi,
  prices: Map<string, string>,
  method: string,
  pathParams: string[],
): Schema {
  const operation: Schema = {};

  if (rm.operation_id) operation.operationId = snakeToCamel(rm.operation_id);
  operation.summary = rm.description;
  if (rm.notes) operation.description = rm.notes;
  operation.security = [{ x402: [] }];

  const price = lookupPrice(rm.route, prices);
  if (price) operation["x-price"] = price;

  // Parameters (path + query)
  const parameters: Schema[] = [];
  for (const param of pathParams) {
    parameters.push({
      name: param,
      in: "path",
      required: true,
      description: `${param} parameter`,
      schema: { type: "string" },
    });
  }
  if (rm.query_params) {
    for (const qp of rm.query_params) {
      parameters.push({
        name: qp.name,
        in: "query",
        description: qp.description,
        schema: { type: qp.type },
      });
    }
  }
  if (parameters.length > 0) operation.parameters = parameters;

  // Request body (POST/PUT/PATCH only)
  if (rm.request && ["post", "put", "patch"].includes(method)) {
    operation.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${rm.request}` },
        },
      },
    };
  }

  // Responses
  const responses: Record<string, Schema> = {};
  const successStatus = String(rm.status);

  if (rm.response && api.interfaces.has(rm.response)) {
    responses[successStatus] = {
      description: rm.description,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${rm.response}` },
        },
      },
    };
  } else {
    responses[successStatus] = {
      description: rm.description,
      content: {
        "application/json": {
          schema: { type: "object" },
        },
      },
    };
  }

  if (rm.errors) {
    for (const err of rm.errors) {
      const status = String(err.status);
      if (status === "402") {
        responses[status] = { description: "x402 payment required." };
      } else {
        responses[status] = {
          description: err.description,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        };
      }
    }
  }

  operation.responses = responses;
  return operation;
}

function buildPaths(
  p: Primitive,
  api: ParsedApi,
  prices: Map<string, string>,
): Record<string, Schema> {
  const paths: Record<string, Schema> = {};

  paths["/"] = buildHealthCheck(p);

  for (const rm of p.routes_map ?? []) {
    const [methodUpper, ...pathParts] = rm.route.split(" ");
    const method = methodUpper.toLowerCase();
    const rawPath = pathParts.join(" ");
    const openApiPath = rawPath.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
    const pathParams = extractPathParams(rm.route);

    const operation = buildOperation(rm, api, prices, method, pathParams);
    if (!paths[openApiPath]) paths[openApiPath] = {};
    (paths[openApiPath] as Record<string, Schema>)[method] = operation;
  }

  return paths;
}

// ── Main renderer ────────────────────────────────────────────────────────────

export function renderOpenApi(p: Primitive, api: ParsedApi, prices: Map<string, string>): string {
  const endpoint = p.endpoint ?? `${p.id}.prim.sh`;

  const rootTypes: string[] = [];
  for (const rm of p.routes_map ?? []) {
    if (rm.request) rootTypes.push(rm.request);
    if (rm.response) rootTypes.push(rm.response);
  }
  const referenced = collectReferencedInterfaces(rootTypes, api.interfaces);

  const spec = {
    openapi: "3.1.0",
    info: {
      title: `${endpoint} API`,
      version: "1.0.0",
      description: p.description,
    },
    servers: [{ url: `https://${endpoint}` }],
    security: [{ x402: [] }],
    components: {
      securitySchemes: {
        x402: {
          type: "apiKey",
          in: "header",
          name: "Payment-Signature",
          description:
            "EIP-3009 signed payment authorization. Server issues a 402 challenge; client signs and retries.\nSee https://prim.sh/pay for the full x402 payment flow.\n",
        },
      },
      schemas: buildSchemas(api, referenced),
    },
    paths: buildPaths(p, api, prices),
  };

  return stringify(spec, { lineWidth: 120 });
}
