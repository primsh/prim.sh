// SPDX-License-Identifier: Apache-2.0
/**
 * SE-2: Live smoke test against Tavily API.
 * Tests TavilyClient directly — web search, news search, URL extract.
 *
 * Run:
 *   TAVILY_API_KEY=tvly-xxx pnpm -C packages/search test:smoke
 *
 * Skips gracefully when TAVILY_API_KEY is not set.
 */

import { describe, it, expect } from "vitest";
import { TavilyClient } from "../src/tavily.ts";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const HAS_KEY = !!process.env.TAVILY_API_KEY;

// ─── Shared state ──────────────────────────────────────────────────────

let client: TavilyClient;

// ─── Tests ─────────────────────────────────────────────────────────────

describe.skipIf(!HAS_KEY)("search.sh Tavily live smoke test", { timeout: 30_000 }, () => {
  it("0. preflight — client instantiates", () => {
    const apiKey = requireEnv("TAVILY_API_KEY");
    client = new TavilyClient(apiKey);
    expect(client).toBeDefined();
  });

  it("1. web search — basic query", async () => {
    const result = await client.search({ query: "TypeScript programming language" });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].score).toBeGreaterThan(0);
    expect(result.results[0].url).toMatch(/^https?:\/\//);
    expect(result.results[0].title).toBeTruthy();
    expect(result.response_time).toBeGreaterThan(0);
  });

  it("2. web search with include_answer", async () => {
    const result = await client.search({
      query: "TypeScript programming language",
      include_answer: true,
    });

    expect(result.results.length).toBeGreaterThan(0);
    // answer requires a paid tier — skip assertion if null
    if (!result.answer) return;
    expect(typeof result.answer).toBe("string");
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("3. news search", async () => {
    const result = await client.searchNews({ query: "TypeScript programming language" });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].url).toMatch(/^https?:\/\//);
  });

  it("4. URL extract", async () => {
    const url = "https://www.typescriptlang.org";
    const result = await client.extract([url], "markdown");

    expect(result.results.length).toBe(1);
    expect(result.results[0].url).toBe(url);
    expect(result.results[0].content).toBeTruthy();
    expect(result.failed.length).toBe(0);
  });
});
