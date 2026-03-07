// SPDX-License-Identifier: Apache-2.0
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signSessionJwt, verifySessionJwt } from "../src/jwt.ts";
import { createAgentStackMiddleware } from "../src/middleware.ts";
import type { AgentStackRouteConfig } from "../src/types.ts";

// Test private key (never use in production — this is a well-known test key)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// Corresponding address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

describe("JWT sign/verify", () => {
  it("roundtrip: sign then verify recovers the correct address", async () => {
    const token = await signSessionJwt(TEST_PRIVATE_KEY);
    const result = await verifySessionJwt(token);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.address.toLowerCase()).toBe(
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase(),
    );
  });

  it("rejects expired JWT", async () => {
    const token = await signSessionJwt(TEST_PRIVATE_KEY, { ttlSeconds: -1 });
    const result = await verifySessionJwt(token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("jwt_expired");
  });

  it("rejects malformed token", async () => {
    const result = await verifySessionJwt("not-a-valid-token!!!");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_jwt");
  });

  it("rejects token with tampered address", async () => {
    const token = await signSessionJwt(TEST_PRIVATE_KEY);
    const decoded = JSON.parse(atob(token));
    // Tamper the payload but keep the original signature — signature won't match
    const tampered = btoa(
      JSON.stringify({
        payload: {
          ...decoded.payload,
          sub: "0x0000000000000000000000000000000000000001",
        },
        signature: decoded.signature,
      }),
    );

    const result = await verifySessionJwt(tampered);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_signature");
  });

  it("rejects token with missing fields", async () => {
    const token = btoa(JSON.stringify({ payload: { sub: "0x1" }, signature: "0x2" }));
    const result = await verifySessionJwt(token);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_jwt");
  });

  it("rejects token with invalid field types", async () => {
    const token = btoa(
      JSON.stringify({
        payload: { sub: "0x1", iat: "not-a-number", exp: "also-not-a-number" },
        signature: "0x2",
      }),
    );
    const result = await verifySessionJwt(token);
    expect(result.ok).toBe(false);
  });

  it("respects custom TTL", async () => {
    const token = await signSessionJwt(TEST_PRIVATE_KEY, { ttlSeconds: 3600 });
    const decoded = JSON.parse(atob(token));
    expect(decoded.payload.exp - decoded.payload.iat).toBe(3600);
  });
});

// ─── Middleware identity route integration ────────────────────────────────

const TEST_PAY_TO = "0xPayToAddress";
const TEST_NETWORK = "eip155:8453";

const routes: AgentStackRouteConfig = {
  "POST /v1/chat": "$0.001",
  "POST /v1/expensive": "$0.10",
};

const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url =
    typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
  if (url.endsWith("/supported")) {
    return new Response(
      JSON.stringify({
        kinds: [{ x402Version: 2, scheme: "exact", network: TEST_NETWORK }],
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

beforeAll(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("Middleware identity routes with JWT", () => {
  function createApp() {
    const app = new Hono();
    app.use(
      "*",
      createAgentStackMiddleware(
        {
          payTo: TEST_PAY_TO,
          network: TEST_NETWORK,
          facilitatorUrl: "https://x402.example",
          freeRoutes: ["GET /"],
          identityRoutes: ["POST /v1/chat"],
        },
        routes,
      ),
    );
    app.get("/", (c) => c.json({ status: "ok" }));
    app.post("/v1/chat", (c) => c.json({ route: "chat", wallet_address: c.get("walletAddress") }));
    app.post("/v1/expensive", (c) =>
      c.json({ route: "expensive", wallet_address: c.get("walletAddress") }),
    );
    return app;
  }

  it("accepts valid JWT on identity route and sets walletAddress", async () => {
    const app = createApp();
    const token = await signSessionJwt(TEST_PRIVATE_KEY);

    const res = await app.request("/v1/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wallet_address?.toLowerCase()).toBe(
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase(),
    );
  });

  it("falls through to x402 (402) on identity route without JWT", async () => {
    const app = createApp();

    const res = await app.request("/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    expect(res.status).toBe(402);
  });

  it("ignores JWT on non-identity (payment) routes — still requires x402", async () => {
    const app = createApp();
    const token = await signSessionJwt(TEST_PRIVATE_KEY);

    const res = await app.request("/v1/expensive", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: "test" }),
    });

    // Should get 402, not 200 — JWT is not valid auth for payment routes
    expect(res.status).toBe(402);
  });

  it("falls through to x402 on identity route with expired JWT", async () => {
    const app = createApp();
    const token = await signSessionJwt(TEST_PRIVATE_KEY, { ttlSeconds: -1 });

    const res = await app.request("/v1/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    expect(res.status).toBe(402);
  });

  it("falls through to x402 on identity route with invalid JWT", async () => {
    const app = createApp();

    const res = await app.request("/v1/chat", {
      method: "POST",
      headers: {
        Authorization: "Bearer garbage-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    expect(res.status).toBe(402);
  });
});
