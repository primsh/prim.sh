// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/create/openapi.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export type ScaffoldResponse = Record<string, unknown>;

export type ValidateResponse = Record<string, unknown>;

export type GetSchemaResponse = Record<string, unknown>;

export type GetPortsResponse = Record<string, unknown>;

// ── Client ─────────────────────────────────────────────────────────────────

export function createCreateClient(primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const baseUrl = "https://create.prim.sh";
  return {
    async scaffold(): Promise<ScaffoldResponse> {
      const url = `${baseUrl}/v1/scaffold`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return res.json() as Promise<ScaffoldResponse>;
    },
    async validate(): Promise<ValidateResponse> {
      const url = `${baseUrl}/v1/validate`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return res.json() as Promise<ValidateResponse>;
    },
    async getSchema(): Promise<GetSchemaResponse> {
      const url = `${baseUrl}/v1/schema`;
      const res = await primFetch(url);
      return res.json() as Promise<GetSchemaResponse>;
    },
    async getPorts(): Promise<GetPortsResponse> {
      const url = `${baseUrl}/v1/ports`;
      const res = await primFetch(url);
      return res.json() as Promise<GetPortsResponse>;
    },
  };
}
