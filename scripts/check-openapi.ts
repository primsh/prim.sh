#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * check-openapi.ts — Validate OpenAPI specs against actual code.
 *
 * For each OpenAPI spec at packages/<id>/openapi.yaml:
 *   1. Checks that every error code in the package's api.ts ERROR_CODES is documented in the spec
 *   2. Checks that every endpoint path in the spec has a corresponding route in the package's index.ts
 *   3. Warns on response schema field name mismatches between spec and api.ts interfaces
 *
 * Exit 0 if all checks pass, 1 if any fail.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { primsForInterface, specPath } from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");

interface CheckResult {
  errors: string[];
  warnings: string[];
}

// Extract ERROR_CODES from api.ts
function extractErrorCodes(apiContent: string): string[] | null {
  const match = apiContent.match(/export\s+const\s+ERROR_CODES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
  if (!match) return null;

  const codes: string[] = [];
  const raw = match[1];
  for (const m of raw.matchAll(/"([^"]+)"/g)) {
    codes.push(m[1]);
  }
  return codes;
}

// Extract error code enum from OpenAPI spec
function extractSpecErrorCodes(spec: Record<string, unknown>): string[] {
  const components = spec.components as Record<string, unknown> | undefined;
  if (!components) return [];
  const schemas = components.schemas as Record<string, unknown> | undefined;
  if (!schemas) return [];
  const errorSchema = schemas.Error as Record<string, unknown> | undefined;
  if (!errorSchema) return [];
  const props = errorSchema.properties as Record<string, unknown> | undefined;
  if (!props) return [];
  const errorProp = props.error as Record<string, unknown> | undefined;
  if (!errorProp) return [];
  const errorProps = errorProp.properties as Record<string, unknown> | undefined;
  if (!errorProps) return [];
  const codeProp = errorProps.code as Record<string, unknown> | undefined;
  if (!codeProp) return [];
  const enumValues = codeProp.enum as string[] | undefined;
  return enumValues ?? [];
}

// Extract all path+method combinations from spec
function extractSpecPaths(spec: Record<string, unknown>): { method: string; path: string }[] {
  const paths = spec.paths as Record<string, unknown> | undefined;
  if (!paths) return [];

  const routes: { method: string; path: string }[] = [];
  for (const [path, methods] of Object.entries(paths)) {
    if (typeof methods !== "object" || methods === null) continue;
    for (const method of Object.keys(methods as Record<string, unknown>)) {
      if (["get", "post", "put", "delete", "patch"].includes(method)) {
        routes.push({ method: method.toUpperCase(), path });
      }
    }
  }
  return routes;
}

// Normalize spec path params ({id}) to Hono-style (:id) for comparison
function specPathToHonoPattern(specPath: string): string {
  return specPath.replace(/\{([^}]+)\}/g, ":$1");
}

// Extract registered routes from index.ts
function extractIndexRoutes(indexContent: string): { method: string; path: string }[] {
  const routes: { method: string; path: string }[] = [];
  const re = /app\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((match = re.exec(indexContent)) !== null) {
    routes.push({ method: match[1].toUpperCase(), path: match[2] });
  }
  return routes;
}

// Extract interface field names from api.ts for a given interface name
function extractInterfaceFields(apiContent: string, interfaceName: string): string[] | null {
  // Match "export interface Name { ... }" — handles multiline
  const re = new RegExp(
    `export\\s+interface\\s+${interfaceName}\\s*(?:extends\\s+[\\w<>,\\s]+)?\\{([\\s\\S]*?)\\n\\}`,
    "m",
  );
  const match = apiContent.match(re);
  if (!match) return null;

  const body = match[1];
  const fields: string[] = [];
  for (const line of body.split("\n")) {
    const fieldMatch = line.match(/^\s+(\w+)\s*[?:]?\s*:/);
    if (fieldMatch) {
      fields.push(fieldMatch[1]);
    }
  }
  return fields.length > 0 ? fields : null;
}

// Extract schema field names from OpenAPI spec component schema
function extractSpecSchemaFields(
  spec: Record<string, unknown>,
  schemaName: string,
): string[] | null {
  const components = spec.components as Record<string, unknown> | undefined;
  if (!components) return null;
  const schemas = components.schemas as Record<string, unknown> | undefined;
  if (!schemas) return null;
  const schema = schemas[schemaName] as Record<string, unknown> | undefined;
  if (!schema) return null;
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props) return null;
  return Object.keys(props);
}

// Map api.ts response interface names to spec schema names
// The naming conventions differ between packages so we do a best-effort match
function findMatchingSchemas(
  apiContent: string,
  spec: Record<string, unknown>,
): { apiInterface: string; specSchema: string }[] {
  const components = spec.components as Record<string, unknown> | undefined;
  if (!components) return [];
  const schemas = components.schemas as Record<string, unknown> | undefined;
  if (!schemas) return [];

  const specSchemaNames = new Set(Object.keys(schemas).filter((n) => n !== "Error"));
  const pairs: { apiInterface: string; specSchema: string }[] = [];

  // Extract all exported interfaces from api.ts
  const interfaceRe = /export\s+interface\s+(\w+)/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = interfaceRe.exec(apiContent)) !== null) {
    const name = m[1];
    // Skip error/request/meta/list/pagination types
    if (
      name.includes("Request") ||
      name === "ApiError" ||
      name === "ApiErrorDetail" ||
      name.includes("ListResponse") ||
      name.includes("ListMeta") ||
      name.includes("CursorPagination")
    ) {
      continue;
    }

    // Direct match
    if (specSchemaNames.has(name)) {
      pairs.push({ apiInterface: name, specSchema: name });
    }
  }

  return pairs;
}

function checkSpec(primId: string): CheckResult {
  const result: CheckResult = { errors: [], warnings: [] };
  const pkgName = primId;
  const sp = specPath(primId);
  const apiPath = join(ROOT, "packages", pkgName, "src", "api.ts");
  const indexPath = join(ROOT, "packages", pkgName, "src", "index.ts");

  // Parse spec
  let spec: Record<string, unknown>;
  try {
    spec = parseYaml(readFileSync(sp, "utf8")) as Record<string, unknown>;
  } catch (e) {
    result.errors.push(`Failed to parse ${primId}: ${e}`);
    return result;
  }

  // Read api.ts
  let apiContent: string;
  try {
    apiContent = readFileSync(apiPath, "utf8");
  } catch {
    result.warnings.push(`No api.ts found for ${pkgName} — skipping error code and schema checks`);
    apiContent = "";
  }

  // Read index.ts
  let indexContent: string;
  try {
    indexContent = readFileSync(indexPath, "utf8");
  } catch {
    result.warnings.push(`No index.ts found for ${pkgName} — skipping route checks`);
    indexContent = "";
  }

  // ── Check 1: ERROR_CODES coverage ───────────────────────────────────────
  if (apiContent) {
    const codeErrors = extractErrorCodes(apiContent);
    const specCodes = extractSpecErrorCodes(spec);

    if (codeErrors && specCodes.length > 0) {
      for (const code of codeErrors) {
        if (!specCodes.includes(code)) {
          result.errors.push(
            `[${pkgName}] Error code "${code}" is in api.ts ERROR_CODES but missing from spec`,
          );
        }
      }
      // Also check reverse: spec has codes not in api.ts (warning only)
      for (const code of specCodes) {
        if (!codeErrors.includes(code)) {
          result.warnings.push(
            `[${pkgName}] Error code "${code}" is in spec but missing from api.ts ERROR_CODES`,
          );
        }
      }
    } else if (codeErrors && specCodes.length === 0) {
      result.warnings.push(`[${pkgName}] api.ts has ERROR_CODES but spec has no error code enum`);
    } else if (!codeErrors && specCodes.length > 0) {
      result.warnings.push(
        `[${pkgName}] Spec has error code enum but api.ts has no ERROR_CODES array`,
      );
    }
  }

  // ── Check 2: Endpoint path coverage ─────────────────────────────────────
  if (indexContent) {
    const specPaths = extractSpecPaths(spec);
    const indexRoutes = extractIndexRoutes(indexContent);

    // Routes provided by x402 middleware (createAgentStackMiddleware), not in index.ts
    const middlewareRoutes = new Set(["GET /", "GET /llms.txt"]);

    // Convert index routes to a set of "METHOD /path" for lookup
    const indexRouteSet = new Set(indexRoutes.map((r) => `${r.method} ${r.path}`));

    for (const specRoute of specPaths) {
      const honoPath = specPathToHonoPattern(specRoute.path);
      const key = `${specRoute.method} ${honoPath}`;

      if (middlewareRoutes.has(key)) continue;

      if (!indexRouteSet.has(key)) {
        // Check if any index route matches with param wildcards
        const found = indexRoutes.some(
          (r) => r.method === specRoute.method && routeMatches(r.path, honoPath),
        );
        if (!found) {
          result.errors.push(
            `[${pkgName}] Spec endpoint ${specRoute.method} ${specRoute.path} has no matching route in index.ts`,
          );
        }
      }
    }
  }

  // ── Check 3: Response schema field names ────────────────────────────────
  if (apiContent) {
    const pairs = findMatchingSchemas(apiContent, spec);
    for (const { apiInterface, specSchema } of pairs) {
      const apiFields = extractInterfaceFields(apiContent, apiInterface);
      const specFields = extractSpecSchemaFields(spec, specSchema);

      if (apiFields && specFields) {
        const apiSet = new Set(apiFields);
        const specSet = new Set(specFields);

        for (const f of apiFields) {
          if (!specSet.has(f)) {
            result.warnings.push(
              `[${pkgName}] Field "${f}" in api.ts ${apiInterface} but missing from spec ${specSchema}`,
            );
          }
        }
        for (const f of specFields) {
          if (!apiSet.has(f)) {
            result.warnings.push(
              `[${pkgName}] Field "${f}" in spec ${specSchema} but missing from api.ts ${apiInterface}`,
            );
          }
        }
      }
    }
  }

  return result;
}

// Check if two Hono-style routes match (handling :param segments)
function routeMatches(route: string, pattern: string): boolean {
  const routeParts = route.split("/");
  const patternParts = pattern.split("/");
  if (routeParts.length !== patternParts.length) return false;
  return routeParts.every(
    (part, i) =>
      part === patternParts[i] || part.startsWith(":") || patternParts[i].startsWith(":"),
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

const prims = primsForInterface("rest").map((p) => p.id).sort();
let hasErrors = false;

console.log(`Checking ${prims.length} OpenAPI specs...\n`);

for (const primId of prims) {
  const result = checkSpec(primId);

  if (result.errors.length > 0 || result.warnings.length > 0) {
    console.log(`--- ${primId} ---`);
    for (const err of result.errors) {
      console.log(`  ERROR: ${err}`);
      hasErrors = true;
    }
    for (const warn of result.warnings) {
      console.log(`  WARN:  ${warn}`);
    }
    console.log();
  }
}

if (hasErrors) {
  console.log("OpenAPI spec validation FAILED (see errors above)");
  process.exit(1);
} else {
  console.log("OpenAPI spec validation passed (warnings only, if any)");
  process.exit(0);
}
