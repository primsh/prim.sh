// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../src/api.ts";
import {
  _cacheSize,
  _resetCache,
  _setRate,
  calculateActualCost,
  createInferCalculator,
  createInferEstimator,
  estimateCost,
  estimateTokens,
  getModelRate,
} from "../src/pricing.ts";

const FALLBACK_PROMPT = 0.00000003;
const FALLBACK_COMPLETION = 0.00000006;
const FLOOR = "0.001000";

describe("pricing", () => {
  beforeEach(() => {
    _resetCache();
  });

  afterEach(() => {
    _resetCache();
  });

  // ─── getModelRate ───────────────────────────────────────────────────────

  describe("getModelRate", () => {
    it("returns fallback rates for unknown model", () => {
      const rate = getModelRate("unknown/model");
      expect(rate.prompt).toBe(FALLBACK_PROMPT);
      expect(rate.completion).toBe(FALLBACK_COMPLETION);
    });

    it("returns cached rates for known model", () => {
      _setRate("openai/gpt-4o", { prompt: 0.0000025, completion: 0.00001 });
      const rate = getModelRate("openai/gpt-4o");
      expect(rate.prompt).toBe(0.0000025);
      expect(rate.completion).toBe(0.00001);
    });
  });

  // ─── estimateTokens ────────────────────────────────────────────────────

  describe("estimateTokens", () => {
    it("estimates tokens from string content", () => {
      const messages: Message[] = [{ role: "user", content: "Hello world!" }];
      // "Hello world!" = 12 chars → ceil(12/4) = 3, + 4 overhead = 7
      expect(estimateTokens(messages)).toBe(7);
    });

    it("estimates tokens from multiple messages", () => {
      const messages: Message[] = [
        { role: "system", content: "You are helpful." }, // ceil(16/4) + 4 = 8
        { role: "user", content: "Hi" }, // ceil(2/4) + 4 = 5
      ];
      expect(estimateTokens(messages)).toBe(13);
    });

    it("handles null content", () => {
      const messages: Message[] = [{ role: "assistant", content: null }];
      // 0 content + 4 overhead = 4
      expect(estimateTokens(messages)).toBe(4);
    });

    it("counts image_url parts as 1600 tokens", () => {
      const messages: Message[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" }, // ceil(13/4) = 4
            { type: "image_url", image_url: { url: "https://example.com/img.png" } },
          ],
        },
      ];
      // 4 (text) + 1600 (image) + 4 (overhead) = 1608
      expect(estimateTokens(messages)).toBe(1608);
    });

    it("handles empty messages array", () => {
      expect(estimateTokens([])).toBe(0);
    });
  });

  // ─── estimateCost ──────────────────────────────────────────────────────

  describe("estimateCost", () => {
    it("applies floor price for cheap models", () => {
      // Unknown model with fallback rates: tiny token count → floor
      const cost = estimateCost("unknown/cheap", 10, 100);
      expect(cost).toBe(FLOOR);
    });

    it("calculates cost above floor for expensive models", () => {
      _setRate("anthropic/claude-opus", { prompt: 0.000015, completion: 0.000075 });
      // 1000 input * 0.000015 = 0.015, 4096 output * 0.000075 = 0.3072 → total = 0.3222
      const cost = estimateCost("anthropic/claude-opus", 1000, 4096);
      expect(Number.parseFloat(cost)).toBeCloseTo(0.3222, 4);
    });

    it("returns floor for zero tokens", () => {
      const cost = estimateCost("unknown/model", 0, 0);
      expect(cost).toBe(FLOOR);
    });
  });

  // ─── calculateActualCost ──────────────────────────────────────────────

  describe("calculateActualCost", () => {
    it("uses usage.cost when available (primary path)", () => {
      const cost = calculateActualCost("openai/gpt-4o", {
        prompt_tokens: 100,
        completion_tokens: 50,
        cost: 0.005,
      });
      expect(cost).toBe("0.005000");
    });

    it("enforces floor on usage.cost", () => {
      const cost = calculateActualCost("openai/gpt-4o", {
        prompt_tokens: 10,
        completion_tokens: 5,
        cost: 0.0001, // below $0.001 floor
      });
      expect(cost).toBe(FLOOR);
    });

    it("falls back to token-based calculation when usage.cost is missing", () => {
      _setRate("openai/gpt-4o", { prompt: 0.0000025, completion: 0.00001 });
      const cost = calculateActualCost("openai/gpt-4o", {
        prompt_tokens: 1000,
        completion_tokens: 500,
      });
      // 1000 * 0.0000025 + 500 * 0.00001 = 0.0025 + 0.005 = 0.0075
      expect(cost).toBe("0.007500");
    });

    it("falls back to token-based calculation when usage.cost is 0", () => {
      _setRate("test/model", { prompt: 0.00001, completion: 0.00002 });
      const cost = calculateActualCost("test/model", {
        prompt_tokens: 200,
        completion_tokens: 100,
        cost: 0,
      });
      // 200 * 0.00001 + 100 * 0.00002 = 0.002 + 0.002 = 0.004
      expect(cost).toBe("0.004000");
    });

    it("uses fallback rates for unknown models without usage.cost", () => {
      const cost = calculateActualCost("unknown/model", {
        prompt_tokens: 100,
        completion_tokens: 50,
      });
      // Tiny amounts → floor
      expect(cost).toBe(FLOOR);
    });
  });

  // ─── cache management ─────────────────────────────────────────────────

  describe("cache management", () => {
    it("_resetCache clears all entries", () => {
      _setRate("a", { prompt: 1, completion: 1 });
      _setRate("b", { prompt: 1, completion: 1 });
      expect(_cacheSize()).toBe(2);
      _resetCache();
      expect(_cacheSize()).toBe(0);
    });
  });

  // ─── createInferEstimator ─────────────────────────────────────────────

  describe("createInferEstimator", () => {
    it("returns a CostEstimator function", () => {
      const estimator = createInferEstimator();
      expect(typeof estimator).toBe("function");
    });

    it("estimates cost from request body", async () => {
      _setRate("openai/gpt-4o-mini", { prompt: 0.00000015, completion: 0.0000006 });

      const body = {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1000,
      };

      const setValues = new Map<string, unknown>();
      const mockContext = {
        req: { json: vi.fn().mockResolvedValue(body) },
        set: vi.fn((key: string, val: unknown) => setValues.set(key, val)),
        get: vi.fn((key: string) => setValues.get(key)),
      };

      const estimator = createInferEstimator();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const cost = await estimator(mockContext as any);

      expect(cost).toBeDefined();
      expect(Number.parseFloat(cost)).toBeGreaterThan(0);
      expect(mockContext.set).toHaveBeenCalledWith("estimatedMaxTokens", 1000);
    });

    it("uses default max_tokens when not specified", async () => {
      const body = {
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
      };

      const setValues = new Map<string, unknown>();
      const mockContext = {
        req: { json: vi.fn().mockResolvedValue(body) },
        set: vi.fn((key: string, val: unknown) => setValues.set(key, val)),
        get: vi.fn((key: string) => setValues.get(key)),
      };

      const estimator = createInferEstimator();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      await estimator(mockContext as any);

      expect(mockContext.set).toHaveBeenCalledWith("estimatedMaxTokens", 4096);
    });
  });

  // ─── createInferCalculator ────────────────────────────────────────────

  describe("createInferCalculator", () => {
    it("returns a CostCalculator function", () => {
      const calculator = createInferCalculator();
      expect(typeof calculator).toBe("function");
    });

    it("uses usage from context when available", async () => {
      _setRate("openai/gpt-4o", { prompt: 0.0000025, completion: 0.00001 });

      const contextValues: Record<string, unknown> = {
        inferModel: "openai/gpt-4o",
        inferUsage: { prompt_tokens: 500, completion_tokens: 200, cost: 0.0035 },
      };

      const mockContext = {
        get: vi.fn((key: string) => contextValues[key]),
      };

      const calculator = createInferCalculator();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const cost = await calculator(mockContext as any, new Response());

      expect(cost).toBe("0.003500");
    });

    it("returns estimate when no usage data", async () => {
      const contextValues: Record<string, unknown> = {
        inferModel: "openai/gpt-4o",
        inferUsage: undefined,
        estimatedPrice: "$0.012000",
      };

      const mockContext = {
        get: vi.fn((key: string) => contextValues[key]),
      };

      const calculator = createInferCalculator();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const cost = await calculator(mockContext as any, new Response());

      expect(cost).toBe("$0.012000");
    });
  });
});
