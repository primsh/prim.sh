// SPDX-License-Identifier: Apache-2.0
import type { ServiceResult } from "@primsh/x402-middleware";
import type {
  DescribeRequest,
  DescribeResponse,
  GenerateRequest,
  GenerateResponse,
  ListModelsResponse,
  UpscaleRequest,
  UpscaleResponse,
} from "./api.ts";
// Re-export for convenience
export { ProviderError } from "./provider.ts";

// ─── Service functions ────────────────────────────────────────────────────────

export async function generate(_body: GenerateRequest): Promise<ServiceResult<GenerateResponse>> {
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}

export async function describe(_body: DescribeRequest): Promise<ServiceResult<DescribeResponse>> {
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}

export async function upscale(_body: UpscaleRequest): Promise<ServiceResult<UpscaleResponse>> {
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}

export async function models(): Promise<ServiceResult<ListModelsResponse>> {
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}
