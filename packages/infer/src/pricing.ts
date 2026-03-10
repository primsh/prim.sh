// SPDX-License-Identifier: Apache-2.0
/**
 * Model pricing cache, token estimator, and cost calculator for infer.sh metered billing.
 *
 * - Fetches OpenRouter /models on startup, caches in-memory, refreshes hourly.
 * - Estimates cost pre-response from model rates + token count.
 * - Calculates actual cost post-response from OpenRouter's usage.cost field.
 */

import type { CostCalculator, CostEstimator } from "@primsh/x402-middleware";
import type { ContentPart, Message, ModelPricing } from "./api.ts";
import { createLogger } from "@primsh/x402-middleware";

const log = createLogger("infer.sh", { module: "pricing" });

// ─── Model pricing cache ────────────────────────────────────────────────────

interface ModelRate {
  /** USD per token (prompt/input) */
  prompt: number;
  /** USD per token (completion/output) */
  completion: number;
}

/** Fallback rates for unknown models: $0.03/1M prompt, $0.06/1M completion */
const FALLBACK_RATE: ModelRate = {
  prompt: 0.00000003,
  completion: 0.00000006,
};

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MINIMUM_PRICE = "0.001";
const DEFAULT_MAX_TOKENS = 4096;

/** In-memory model rates keyed by model ID */
const rateCache = new Map<string, ModelRate>();
let refreshTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Fetch model pricing from OpenRouter and populate the cache.
 * Fails silently (logs warning) — fallback rates apply for uncached models.
 */
async function refreshModelPricing(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    log.warn("OPENROUTER_API_KEY not set — using fallback rates for all models");
    return;
  }

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://prim.sh",
        "X-Title": "infer.prim.sh",
      },
    });

    if (!resp.ok) {
      log.warn(`OpenRouter /models returned ${resp.status} — using cached/fallback rates`);
      return;
    }

    const data = (await resp.json()) as {
      data: Array<{ id: string; pricing: ModelPricing }>;
    };

    let count = 0;
    for (const model of data.data) {
      if (!model.pricing) continue;
      const prompt = Number.parseFloat(model.pricing.prompt);
      const completion = Number.parseFloat(model.pricing.completion);
      if (Number.isNaN(prompt) || Number.isNaN(completion)) continue;
      rateCache.set(model.id, { prompt, completion });
      count++;
    }

    log.info(`Model pricing cache refreshed: ${count} models`);
  } catch (err) {
    log.warn("Failed to refresh model pricing", { error: String(err) });
  }
}

/**
 * Initialize model pricing cache. Call on startup before serving requests.
 * Starts hourly refresh interval.
 */
export async function initModelPricing(): Promise<void> {
  await refreshModelPricing();

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshModelPricing().catch((err) => {
      log.error("Model pricing refresh failed", { error: String(err) });
    });
  }, REFRESH_INTERVAL_MS);
  refreshTimer.unref();
}

/**
 * Get per-token rates for a model. Returns fallback rates for unknown models.
 */
export function getModelRate(modelId: string): ModelRate {
  return rateCache.get(modelId) ?? FALLBACK_RATE;
}

/** Visible for testing. */
export function _resetCache(): void {
  rateCache.clear();
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

/** Visible for testing. */
export function _setRate(modelId: string, rate: ModelRate): void {
  rateCache.set(modelId, rate);
}

/** Visible for testing. Returns the number of cached models. */
export function _cacheSize(): number {
  return rateCache.size;
}

// ─── Token estimation ───────────────────────────────────────────────────────

/**
 * Estimate token count from message content.
 * - Text: string length / 4, rounded up (rough approximation of BPE)
 * - Image: 1600 tokens per image_url content part
 */
function estimateContentTokens(content: string | ContentPart[] | null): number {
  if (content === null || content === undefined) return 0;

  if (typeof content === "string") {
    return Math.ceil(content.length / 4);
  }

  let tokens = 0;
  for (const part of content) {
    if (part.type === "text" && part.text) {
      tokens += Math.ceil(part.text.length / 4);
    } else if (part.type === "image_url") {
      tokens += 1600;
    }
  }
  return tokens;
}

/**
 * Estimate total input tokens for a messages array.
 * Adds 4 tokens per message for role/separator overhead.
 */
export function estimateTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateContentTokens(msg.content);
    total += 4; // role + separators overhead per message
  }
  return total;
}

// ─── Cost calculation ───────────────────────────────────────────────────────

/**
 * Estimate the cost of a request given model rates and token counts.
 * Returns a decimal USDC string (e.g. "0.003500"). Enforces minimum price floor.
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  maxOutputTokens: number,
): string {
  const rate = getModelRate(modelId);
  const inputCost = inputTokens * rate.prompt;
  const outputCost = maxOutputTokens * rate.completion;
  const total = inputCost + outputCost;

  const floor = Number.parseFloat(MINIMUM_PRICE);
  const cost = Math.max(total, floor);
  return cost.toFixed(6);
}

/**
 * Calculate actual cost from OpenRouter usage data.
 * Primary: uses `usage.cost` (ground-truth from OpenRouter).
 * Fallback: computes from token counts × model rates.
 */
export function calculateActualCost(
  modelId: string,
  usage: { prompt_tokens: number; completion_tokens: number; cost?: number },
): string {
  // Primary: OpenRouter provides actual USD cost
  if (usage.cost !== undefined && usage.cost !== null && usage.cost > 0) {
    const floor = Number.parseFloat(MINIMUM_PRICE);
    return Math.max(usage.cost, floor).toFixed(6);
  }

  // Fallback: compute from tokens × rates
  const rate = getModelRate(modelId);
  const cost = usage.prompt_tokens * rate.prompt + usage.completion_tokens * rate.completion;
  const floor = Number.parseFloat(MINIMUM_PRICE);
  return Math.max(cost, floor).toFixed(6);
}

// ─── CostEstimator / CostCalculator factories ──────────────────────────────

/**
 * Create a CostEstimator for infer.sh chat routes.
 * Reads body.model, body.messages, body.max_tokens from the request.
 * Stores the max_tokens used for estimation on context so the handler
 * can enforce it in the OpenRouter request.
 */
export function createInferEstimator(): CostEstimator {
  return async (c) => {
    const body = await c.req.json();
    const model: string = body.model ?? "";
    const messages: Message[] = body.messages ?? [];
    const maxTokens: number = body.max_tokens ?? DEFAULT_MAX_TOKENS;

    const inputTokens = estimateTokens(messages);
    const cost = estimateCost(model, inputTokens, maxTokens);

    // Store max_tokens on context so the handler can inject it into the
    // OpenRouter request if the agent didn't set one (bounds output cost).
    c.set("estimatedMaxTokens" as never, maxTokens);

    return cost;
  };
}

/**
 * Create a CostCalculator for infer.sh chat routes.
 * Reads usage data from context (set by handler after response).
 * For streaming: handler extracts usage from final SSE chunk and sets it.
 * For non-streaming: handler sets it from ChatResponse.usage.
 */
export function createInferCalculator(): CostCalculator {
  return async (c) => {
    const model = (c.get("inferModel" as never) as string) ?? "";
    const usage = c.get("inferUsage" as never) as
      | { prompt_tokens: number; completion_tokens: number; cost?: number }
      | undefined;

    if (!usage) {
      // No usage data — return the estimate as-is (no settlement adjustment)
      return c.get("estimatedPrice") as string;
    }

    return calculateActualCost(model, usage);
  };
}
