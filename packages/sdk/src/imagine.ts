// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/imagine/openapi.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export type DescribeRequest = Record<string, unknown>;

export type DescribeResponse = Record<string, unknown>;

export type GenerateRequest = Record<string, unknown>;

export type GenerateResponse = Record<string, unknown>;

export type ModelsResponse = Record<string, unknown>;

export type UpscaleRequest = Record<string, unknown>;

export type UpscaleResponse = Record<string, unknown>;

// ── Client ─────────────────────────────────────────────────────────────────

export function createImagineClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://imagine.prim.sh",
) {
  return {
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      const url = `${baseUrl}/v1/generate`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<GenerateResponse>;
    },
    async describe(req: DescribeRequest): Promise<DescribeResponse> {
      const url = `${baseUrl}/v1/describe`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<DescribeResponse>;
    },
    async upscale(req: UpscaleRequest): Promise<UpscaleResponse> {
      const url = `${baseUrl}/v1/upscale`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<UpscaleResponse>;
    },
    async listModels(): Promise<ModelsResponse> {
      const url = `${baseUrl}/v1/models`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<ModelsResponse>;
    },
  };
}
