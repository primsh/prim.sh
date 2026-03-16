// SPDX-License-Identifier: Apache-2.0
/**
 * scripts/lib/extract-schemas.ts — Zod schema extractor for code generation
 *
 * Replaces parse-api.ts. Imports api.ts directly (Bun can import .ts),
 * extracts Zod schemas, and produces:
 *   1. ParsedApi (backward compat for generators that need field-level info)
 *   2. JSON Schema map (for gen-openapi, includes validation constraints)
 */

import { z } from "zod";

// ── Output types (formerly in parse-api.ts) ──────────────────────────────

export interface ParsedField {
  name: string;
  type: string;
  optional: boolean;
  description: string;
}

export interface ParsedInterface {
  name: string;
  fields: ParsedField[];
  extends?: string;
}

export interface ParsedApi {
  interfaces: Map<string, ParsedInterface>;
  errorCodes: string[];
}

type JsonSchema = Record<string, unknown>;

export interface ExtractedSchemas {
  /** Backward-compatible ParsedApi for gen-prims, gen-docs, gen-tests, gen-gate */
  api: ParsedApi;
  /** Raw JSON Schema per interface name, for gen-openapi (includes validation constraints) */
  jsonSchemas: Record<string, JsonSchema>;
}

// ── JSON Schema → ParsedField conversion ─────────────────────────────────

function jsonSchemaTypeToTs(prop: JsonSchema): string {
  // anyOf with null → nullable
  if (prop.anyOf && Array.isArray(prop.anyOf)) {
    const variants = prop.anyOf as JsonSchema[];
    const nullVariant = variants.find((v) => v.type === "null");
    const nonNull = variants.filter((v) => v.type !== "null");
    if (nullVariant && nonNull.length === 1) {
      return `${jsonSchemaTypeToTs(nonNull[0])} | null`;
    }
    return variants.map((v) => jsonSchemaTypeToTs(v)).join(" | ");
  }

  // const (literal)
  if (prop.const !== undefined) {
    if (typeof prop.const === "string") return `"${prop.const}"`;
    return String(prop.const);
  }

  // enum
  if (prop.enum && Array.isArray(prop.enum)) {
    return (prop.enum as string[]).map((v) => `"${v}"`).join(" | ");
  }

  // array
  if (prop.type === "array") {
    const items = prop.items as JsonSchema | undefined;
    if (items) return `${jsonSchemaTypeToTs(items)}[]`;
    return "unknown[]";
  }

  // object with properties → interface ref (use $ref name if available)
  if (prop.type === "object" && prop.properties) {
    return "object";
  }

  // $ref
  if (prop.$ref && typeof prop.$ref === "string") {
    return prop.$ref as string;
  }

  // primitive types
  if (prop.type === "string") return "string";
  if (prop.type === "number" || prop.type === "integer") return "number";
  if (prop.type === "boolean") return "boolean";
  if (prop.type === "null") return "null";

  return "unknown";
}

function jsonSchemaToFields(schema: JsonSchema): ParsedField[] {
  const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((schema.required ?? []) as string[]);
  const fields: ParsedField[] = [];

  for (const [name, prop] of Object.entries(props)) {
    fields.push({
      name,
      type: jsonSchemaTypeToTs(prop),
      optional: !required.has(name),
      description: (prop.description as string) ?? "",
    });
  }

  return fields;
}

// ── Post-processing for OpenAPI compat ───────────────────────────────────

/** Strip $schema and additionalProperties from JSON Schema for OpenAPI components */
function cleanForOpenApi(schema: JsonSchema): JsonSchema {
  const cleaned = { ...schema };
  delete cleaned.$schema;
  delete cleaned.additionalProperties;
  // Recursively clean nested properties
  if (cleaned.properties && typeof cleaned.properties === "object") {
    const props = { ...cleaned.properties } as Record<string, JsonSchema>;
    for (const [key, val] of Object.entries(props)) {
      if (val && typeof val === "object") {
        props[key] = cleanForOpenApi(val);
      }
    }
    cleaned.properties = props;
  }
  // Clean items in arrays
  if (cleaned.items && typeof cleaned.items === "object") {
    cleaned.items = cleanForOpenApi(cleaned.items as JsonSchema);
  }
  // Clean anyOf variants
  if (cleaned.anyOf && Array.isArray(cleaned.anyOf)) {
    cleaned.anyOf = (cleaned.anyOf as JsonSchema[]).map((v) => cleanForOpenApi(v));
  }
  return cleaned;
}

/** Rewrite bare $ref strings (e.g. "Inner") to OpenAPI-style "#/components/schemas/Inner" */
function rewriteRefs(schema: JsonSchema): JsonSchema {
  const result = { ...schema };
  if (result.$ref && typeof result.$ref === "string" && !result.$ref.startsWith("#")) {
    result.$ref = `#/components/schemas/${result.$ref}`;
  }
  if (result.properties && typeof result.properties === "object") {
    const props = { ...result.properties } as Record<string, JsonSchema>;
    for (const [key, val] of Object.entries(props)) {
      if (val && typeof val === "object") {
        props[key] = rewriteRefs(val);
      }
    }
    result.properties = props;
  }
  if (result.items && typeof result.items === "object") {
    result.items = rewriteRefs(result.items as JsonSchema);
  }
  if (result.anyOf && Array.isArray(result.anyOf)) {
    result.anyOf = (result.anyOf as JsonSchema[]).map((v) => rewriteRefs(v));
  }
  return result;
}

// ── Main extractor ───────────────────────────────────────────────────────

/**
 * Extract Zod schemas from an api.ts module.
 *
 * @param apiPath Absolute path to the api.ts file
 */
export async function extractSchemas(apiPath: string): Promise<ExtractedSchemas> {
  const mod = await import(apiPath);

  // Collect all *Schema exports
  const schemaEntries: [string, z.ZodType][] = [];
  for (const [key, value] of Object.entries(mod)) {
    if (key.endsWith("Schema") && value instanceof z.ZodType) {
      schemaEntries.push([key, value]);
    }
  }

  // Build registry for proper $ref generation
  const registry = z.registry();
  for (const [key, schema] of schemaEntries) {
    const typeName = key.replace(/Schema$/, "");
    registry.add(schema, { id: typeName });
  }

  // Generate JSON Schema with $ref support
  const registryResult = z.toJSONSchema(registry) as { schemas: Record<string, JsonSchema> };
  const jsonSchemas: Record<string, JsonSchema> = {};
  for (const [name, schema] of Object.entries(registryResult.schemas)) {
    jsonSchemas[name] = rewriteRefs(cleanForOpenApi(schema));
  }

  // Build ParsedApi for backward compat
  const interfaces = new Map<string, ParsedInterface>();
  for (const [name, schema] of Object.entries(jsonSchemas)) {
    interfaces.set(name, {
      name,
      fields: jsonSchemaToFields(registryResult.schemas[name]),
    });
  }

  // Extract ERROR_CODES
  const errorCodes: string[] = mod.ERROR_CODES ? [...mod.ERROR_CODES] : [];

  return {
    api: { interfaces, errorCodes },
    jsonSchemas,
  };
}

/**
 * Convenience: extract only ParsedApi (drop-in replacement for parseApiFile).
 */
export async function extractApiFromSchemas(apiPath: string): Promise<ParsedApi> {
  const { api } = await extractSchemas(apiPath);
  return api;
}
