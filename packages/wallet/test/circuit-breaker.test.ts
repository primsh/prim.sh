/**
 * W-9 circuit breaker tests: pause/resume/isPaused truth table, getState, admin routes.
 *
 * sendUsdc integration tests removed in W-10 (non-custodial refactor).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

process.env.WALLET_DB_PATH = ":memory:";

// Stub fetch for x402 middleware (needed for app import)
const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : (input as URL).toString();
  if (url.endsWith("/supported")) {
    return new Response(
      JSON.stringify({
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }],
        extensions: [],
        signers: {},
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

vi.stubGlobal("fetch", mockFetch);

// Import modules after mocks are set up
import { resetDb } from "../src/db.ts";
import { pause, resume, isPaused, getState } from "../src/circuit-breaker.ts";
import app from "../src/index.ts";

beforeEach(() => {
  resetDb();
});

afterEach(() => {
  resetDb();
});

// ─── isPaused truth table ─────────────────────────────────────────────────

describe("isPaused — truth table", () => {
  it("returns false by default (no pauses set)", () => {
    expect(isPaused("send")).toBe(false);
    expect(isPaused("swap")).toBe(false);
    expect(isPaused("all")).toBe(false);
  });

  it("returns true when specific scope is paused (all=No, flow=Yes)", () => {
    pause("send");
    expect(isPaused("send")).toBe(true);
  });

  it("does NOT affect other scope when only send is paused (independent scopes)", () => {
    pause("send");
    expect(isPaused("swap")).toBe(false);
  });

  it("returns true for all scopes when 'all' is paused (all=Yes, flow=No)", () => {
    pause("all");
    expect(isPaused("send")).toBe(true);
    expect(isPaused("swap")).toBe(true);
  });

  it("returns true when both 'all' and specific scope are paused (all=Yes, flow=Yes)", () => {
    pause("all");
    pause("send");
    expect(isPaused("send")).toBe(true);
    expect(isPaused("swap")).toBe(true);
  });
});

// ─── pause/resume toggle ──────────────────────────────────────────────────

describe("pause/resume — state toggling", () => {
  it("resume clears a specific scope pause", () => {
    pause("send");
    expect(isPaused("send")).toBe(true);
    resume("send");
    expect(isPaused("send")).toBe(false);
  });

  it("resume('all') clears global pause, individual scopes unaffected", () => {
    pause("all");
    pause("send");
    resume("all");
    // 'all' cleared — only 'send' scope remains paused
    expect(isPaused("send")).toBe(true);
    // 'swap' was never paused individually, so false now
    expect(isPaused("swap")).toBe(false);
  });

  it("state persists across multiple isPaused calls (SQLite-backed)", () => {
    pause("send");
    expect(isPaused("send")).toBe(true);
    expect(isPaused("send")).toBe(true); // second query same result
    resume("send");
    expect(isPaused("send")).toBe(false);
    expect(isPaused("send")).toBe(false);
  });
});

// ─── getState ─────────────────────────────────────────────────────────────

describe("getState", () => {
  it("returns empty object when no scopes have been touched", () => {
    const state = getState();
    expect(state).toEqual({});
  });

  it("returns paused_at for paused scope and null for resumed scope", () => {
    pause("send");
    pause("swap");
    resume("swap");

    const state = getState();
    expect(typeof state.send).toBe("string"); // ISO timestamp
    expect(state.swap).toBeNull();
  });

  it("returns paused_at for 'all' scope when global paused", () => {
    pause("all");
    const state = getState();
    expect(typeof state.all).toBe("string");
  });
});

// ─── Admin routes ─────────────────────────────────────────────────────────

describe("admin routes", () => {
  it("POST /v1/admin/circuit-breaker/pause changes state to paused", async () => {
    const res = await app.request("/v1/admin/circuit-breaker/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "send" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { scope: string; paused: boolean };
    expect(body.scope).toBe("send");
    expect(body.paused).toBe(true);
    expect(isPaused("send")).toBe(true);
  });

  it("POST /v1/admin/circuit-breaker/resume clears pause state", async () => {
    pause("send");
    expect(isPaused("send")).toBe(true);

    const res = await app.request("/v1/admin/circuit-breaker/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "send" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { scope: string; paused: boolean };
    expect(body.scope).toBe("send");
    expect(body.paused).toBe(false);
    expect(isPaused("send")).toBe(false);
  });

  it("GET /v1/admin/circuit-breaker returns current state", async () => {
    pause("all");

    const res = await app.request("/v1/admin/circuit-breaker");
    expect(res.status).toBe(200);
    const state = await res.json() as Record<string, string | null>;
    expect(typeof state.all).toBe("string");
  });

  it("POST /v1/admin/circuit-breaker/pause returns 400 for invalid scope", async () => {
    const res = await app.request("/v1/admin/circuit-breaker/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "invalid" }),
    });

    expect(res.status).toBe(400);
  });

  it("POST /v1/admin/circuit-breaker/resume returns 400 for missing scope", async () => {
    const res = await app.request("/v1/admin/circuit-breaker/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
