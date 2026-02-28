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
  // TODO: Implement Generate an image from a text prompt. Returns base64 or URL.
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}

export async function describe(body: DescribeRequest): Promise<ServiceResult<DescribeResponse>> {
  // TODO: Implement Describe an image. Accepts base64 or URL. Returns text description.
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}

export async function upscale(body: UpscaleRequest): Promise<ServiceResult<UpscaleResponse>> {
  // TODO: Implement Upscale an image to higher resolution. Accepts base64 or URL.
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}

export async function models(
  body: Record<string, unknown>,
): Promise<ServiceResult<ModelsResponse>> {
  // TODO: Implement List available image models with capabilities and pricing.
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}
