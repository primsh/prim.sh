import type {
  ScaffoldResponse,
  ValidateResponse,
  SchemaResponse,
  PortsResponse,
} from "./api.ts";
import { parse as parseYaml } from "yaml";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { scaffoldPure, type PrimYaml } from "../../../scripts/lib/scaffold.ts";
import primYamlSchema from "./prim-yaml-schema.json";

// ─── ServiceResult ────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve the monorepo root (3 levels up from src/) */
function getRoot(): string {
  // When running via bun from packages/create/src/*, go up to repo root
  return resolve(import.meta.dir, "../../..");
}

/** Basic validation of required PrimYaml fields */
function validateRequired(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (typeof data.id !== "string" || !data.id) errors.push("'id' is required and must be a non-empty string");
  if (typeof data.name !== "string" || !data.name) errors.push("'name' is required and must be a non-empty string");
  if (typeof data.description !== "string" || !data.description) errors.push("'description' is required and must be a non-empty string");
  if (typeof data.port !== "number" || !Number.isInteger(data.port)) errors.push("'port' is required and must be an integer");
  else if (data.port < 1024 || data.port > 65535) errors.push("'port' must be between 1024 and 65535");

  if (typeof data.id === "string" && !/^[a-z][a-z0-9-]*$/.test(data.id)) {
    errors.push("'id' must be lowercase letters, digits, and hyphens, starting with a letter");
  }

  return errors;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function scaffold(
  body: Record<string, unknown>,
): Promise<ServiceResult<ScaffoldResponse>> {
  const spec = body.spec;
  if (typeof spec !== "string" || !spec.trim()) {
    return { ok: false, status: 400, code: "invalid_request", message: "Missing or empty 'spec' field (YAML string)" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(spec) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, status: 400, code: "invalid_request", message: `Invalid YAML: ${String(err)}` };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, status: 400, code: "invalid_request", message: "YAML must parse to an object" };
  }

  const errors = validateRequired(parsed);
  if (errors.length > 0) {
    return { ok: false, status: 400, code: "invalid_request", message: errors.join("; ") };
  }

  const prim = parsed as unknown as PrimYaml;

  try {
    const manifest = scaffoldPure(prim);
    return {
      ok: true,
      data: {
        id: prim.id,
        files: manifest.map((f) => ({ path: f.path, content: f.content })),
      },
    };
  } catch (err) {
    return { ok: false, status: 500, code: "provider_error", message: `Scaffold failed: ${String(err)}` };
  }
}

export async function validate(
  body: Record<string, unknown>,
): Promise<ServiceResult<ValidateResponse>> {
  const spec = body.spec;
  if (typeof spec !== "string" || !spec.trim()) {
    return { ok: false, status: 400, code: "invalid_request", message: "Missing or empty 'spec' field (YAML string)" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(spec) as Record<string, unknown>;
  } catch (err) {
    return {
      ok: true,
      data: { valid: false, errors: [`Invalid YAML: ${String(err)}`] },
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      ok: true,
      data: { valid: false, errors: ["YAML must parse to an object"] },
    };
  }

  // Validate against JSON schema using Ajv
  const errors: string[] = [];
  try {
    const Ajv = (await import("ajv")).default;
    const addFormats = (await import("ajv-formats")).default;
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const valid = ajv.validate(primYamlSchema, parsed);
    if (!valid && ajv.errors) {
      for (const err of ajv.errors) {
        errors.push(`${err.instancePath || "/"}: ${err.message}`);
      }
    }
  } catch (err) {
    // Ajv not available — fall back to basic validation
    errors.push(...validateRequired(parsed));
  }

  return {
    ok: true,
    data: { valid: errors.length === 0, errors },
  };
}

export async function schema(): Promise<ServiceResult<SchemaResponse>> {
  return {
    ok: true,
    data: { schema: primYamlSchema as Record<string, unknown> },
  };
}

export async function ports(): Promise<ServiceResult<PortsResponse>> {
  try {
    const root = getRoot();
    const packagesDir = join(root, "packages");

    const allocated: Array<{ id: string; port: number }> = [];

    if (existsSync(packagesDir)) {
      for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const yamlPath = join(packagesDir, entry.name, "prim.yaml");
        if (!existsSync(yamlPath)) continue;
        try {
          const data = parseYaml(readFileSync(yamlPath, "utf-8")) as Record<string, unknown>;
          if (typeof data.id === "string" && typeof data.port === "number") {
            allocated.push({ id: data.id, port: data.port });
          }
        } catch {
          // skip unparseable files
        }
      }
    }

    allocated.sort((a, b) => a.port - b.port);

    const maxPort = allocated.reduce((max, a) => Math.max(max, a.port), 3010);
    const nextAvailable = maxPort + 1;

    return {
      ok: true,
      data: { allocated, next_available: nextAvailable },
    };
  } catch (err) {
    return { ok: false, status: 500, code: "provider_error", message: `Port scan failed: ${String(err)}` };
  }
}
