// SPDX-License-Identifier: Apache-2.0
// AI SDK provider wrapping infer.prim.sh via OpenAI-compatible protocol.
// Uses x402 payment via the user's custodial wallet for each LLM call.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const INFER_BASE_URL = process.env.INFER_BASE_URL ?? "https://infer.prim.sh";

/**
 * Creates an AI SDK language model backed by infer.prim.sh.
 * `primFetch` is a fetch function pre-configured with x402 payment signing.
 */
export function createInferModel(primFetch: typeof fetch, modelId = "openrouter/auto") {
  const provider = createOpenAICompatible({
    name: "prim-infer",
    baseURL: `${INFER_BASE_URL}/v1`,
    // x402 handles auth — no API key needed
    apiKey: "x402",
    fetch: primFetch as Parameters<typeof createOpenAICompatible>[0] extends { fetch?: infer F }
      ? F
      : never,
  });

  return provider.chatModel(modelId);
}
