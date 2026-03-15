// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/create/openapi.yaml
// Regenerate: pnpm gen:sdk

import { unwrap } from "./shared.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GetSchemaResponse {
  /** JSON Schema for prim.yaml */
  schema: string;
}

export interface ScaffoldFile {
  /** Relative file path (e.g. "packages/foo/src/index.ts") */
  path: string;
  /** File content */
  content: string;
}

export interface ScaffoldRequest {
  /** prim.yaml spec as YAML string */
  spec: string;
}

export interface ScaffoldResponse {
  /** Primitive ID */
  id: string;
  /** Generated files */
  files: ScaffoldFile[];
}

export interface ValidateRequest {
  /** prim.yaml spec as YAML string */
  spec: string;
}

export interface ValidateResponse {
  /** Whether the spec is valid */
  valid: boolean;
  /** Validation errors (empty if valid) */
  errors: string[];
}

export type GetPortsResponse = Record<string, unknown>;

// ── Client ─────────────────────────────────────────────────────────────────

export function createCreateClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://create.prim.sh",
) {
  return {
    async scaffold(req: ScaffoldRequest): Promise<ScaffoldResponse> {
      const url = `${baseUrl}/v1/scaffold`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<ScaffoldResponse>(res);
    },
    async validate(req: ValidateRequest): Promise<ValidateResponse> {
      const url = `${baseUrl}/v1/validate`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<ValidateResponse>(res);
    },
    async getSchema(): Promise<GetSchemaResponse> {
      const url = `${baseUrl}/v1/schema`;
      const res = await primFetch(url);
      return unwrap<GetSchemaResponse>(res);
    },
    async getPorts(): Promise<GetPortsResponse> {
      const url = `${baseUrl}/v1/ports`;
      const res = await primFetch(url);
      return unwrap<GetPortsResponse>(res);
    },
  };
}
