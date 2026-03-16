// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/imagine/generated/openapi.yaml
// Regenerate: pnpm gen:sdk

import { unwrap } from "../src/shared.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface DescribeRequest {
}

export interface DescribeResponse {
}

export interface GenerateRequest {
}

export interface GenerateResponse {
}

export interface ListModelsResponse {
}

export interface UpscaleRequest {
}

export interface UpscaleResponse {
}

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
      return unwrap<GenerateResponse>(res);
    },
    async describe(req: DescribeRequest): Promise<DescribeResponse> {
      const url = `${baseUrl}/v1/describe`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<DescribeResponse>(res);
    },
    async upscale(req: UpscaleRequest): Promise<UpscaleResponse> {
      const url = `${baseUrl}/v1/upscale`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<UpscaleResponse>(res);
    },
    async listModels(): Promise<ListModelsResponse> {
      const url = `${baseUrl}/v1/models`;
      const res = await primFetch(url);
      return unwrap<ListModelsResponse>(res);
    },
  };
}
