import { ProviderError } from "./provider.ts";
import type { ImagineProvider } from "./provider.ts";
// Re-export for convenience
export { ProviderError } from "./provider.ts";
import type {
  DescribeRequest,
  DescribeResponse,
  GenerateRequest,
  GenerateResponse,
  ModelsResponse,
  UpscaleRequest,
  UpscaleResponse,
} from "./api.ts";

// ─── ServiceResult ────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

// ─── Service functions ────────────────────────────────────────────────────────

export async function generate(body: GenerateRequest): Promise<ServiceResult<GenerateResponse>> {
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}

export async function describe(body: DescribeRequest): Promise<ServiceResult<DescribeResponse>> {
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}

export async function upscale(body: UpscaleRequest): Promise<ServiceResult<UpscaleResponse>> {
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}

export async function models(): Promise<ServiceResult<ModelsResponse>> {
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}
