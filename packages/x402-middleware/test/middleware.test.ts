// SPDX-License-Identifier: Apache-2.0
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type AgentStackRouteConfig, createAgentStackMiddleware } from "../src/middleware.ts";
import type { AgentStackMiddlewareOptions } from "../src/types.ts";

const TEST_PAY_TO = "0xPayToAddress";
const TEST_NETWORK = "eip155:8453";

const routes: AgentStackRouteConfig = {
  "GET /free": "$0.00",
  "GET /paid": "$0.01",
};

function createApp() {
  const app = new Hono();

  app.use(
    "*",
    createAgentStackMiddleware(
      {
        payTo: TEST_PAY_TO,
        network: TEST_NETWORK,
        facilitatorUrl: "https://x402.example",
        freeRoutes: ["GET /free"],
      },
      routes,
    ),
  );

  app.get("/free", (c) => {
    return c.json({ route: "free", walletAddress: c.get("walletAddress") });
  });

  app.get("/paid", (c) => {
    return c.json({ route: "paid", walletAddress: c.get("walletAddress") });
  });

  return app;
}

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

describe("AgentStack x402 middleware", () => {
  it("bypasses payment for free routes", async () => {
    const app = createApp();

    const res = await app.request("/free", { method: "GET" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.route).toBe("free");
    expect(body.walletAddress).toBeUndefined();
  });

  it("returns 402 and Payment-Required header for paid route without payment header", async () => {
    const app = createApp();

    const res = await app.request("/paid", { method: "GET" });

    expect(res.status).toBe(402);
    const header = res.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    if (!header) return;

    const decoded = decodePaymentRequiredHeader(header);

    expect(decoded.accepts).toBeInstanceOf(Array);
    expect(decoded.accepts.length).toBeGreaterThan(0);

    const requirement = decoded.accepts[0] as {
      scheme: string;
      network: string;
      payTo: string;
    };

    expect(requirement.scheme).toBe("exact");
    expect(requirement.network).toBe(TEST_NETWORK);
    expect(requirement.payTo).toBe(TEST_PAY_TO);
  });

  it("extracts wallet address from payment header", async () => {
    const app = createApp();

    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: TEST_NETWORK,
      payload: {
        authorization: {
          from: "0xTestAddress",
          to: TEST_PAY_TO,
          value: "1000",
          validAfter: "0",
          validBefore: "9999999999",
          nonce: "0xnonce",
        },
        signature: "0xsignature",
      },
    };

    const header = encodePaymentSignatureHeader(paymentPayload as unknown as never);

    const res = await app.request("/free", {
      method: "GET",
      headers: {
        "PAYMENT-SIGNATURE": header,
      },
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.walletAddress).toBe("0xTestAddress");
  });

  it("handles invalid payment header gracefully", async () => {
    const app = createApp();

    const res = await app.request("/free", {
      method: "GET",
      headers: {
        "PAYMENT-SIGNATURE": "not-base64",
      },
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.walletAddress).toBeUndefined();
  });
});

describe("Wallet allowlist", () => {
  const ALLOWED_ADDRESS = "0xAllowedAddress";

  function makePaymentHeader(from: string) {
    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: TEST_NETWORK,
      payload: {
        authorization: {
          from,
          to: TEST_PAY_TO,
          value: "1000",
          validAfter: "0",
          validBefore: "9999999999",
          nonce: "0xnonce",
        },
        signature: "0xsignature",
      },
    };
    return encodePaymentSignatureHeader(paymentPayload as unknown as never);
  }

  function createAllowlistApp(allowlist?: string[]) {
    const app = new Hono();
    app.use(
      "*",
      createAgentStackMiddleware(
        {
          payTo: TEST_PAY_TO,
          network: TEST_NETWORK,
          facilitatorUrl: "https://x402.example",
          freeRoutes: ["GET /free"],
          allowlist,
        },
        routes,
      ),
    );
    app.get("/free", (c) => c.json({ route: "free", walletAddress: c.get("walletAddress") }));
    app.get("/paid", (c) => c.json({ route: "paid", walletAddress: c.get("walletAddress") }));
    return app;
  }

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: env vars require delete to remove (= undefined sets "undefined")
    delete process.env.PRIM_ALLOWLIST;
  });

  it("allows wallet on allowlist", async () => {
    const app = createAllowlistApp([ALLOWED_ADDRESS]);
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader(ALLOWED_ADDRESS) },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.walletAddress).toBe(ALLOWED_ADDRESS);
  });

  it("blocks wallet not on allowlist with 403", async () => {
    const app = createAllowlistApp([ALLOWED_ADDRESS]);
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xOtherAddress") },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("wallet_not_allowed");
    expect(body.message).toContain("private beta");
  });

  it("allows all wallets when no allowlist is set", async () => {
    const app = createAllowlistApp(undefined);
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xAnyAddress") },
    });
    expect(res.status).toBe(200);
  });

  it("performs case-insensitive address comparison", async () => {
    const app = createAllowlistApp(["0xallowedaddress"]);
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xALLOWEDADDRESS") },
    });
    expect(res.status).toBe(200);
  });

  it("reads allowlist from PRIM_ALLOWLIST env var", async () => {
    process.env.PRIM_ALLOWLIST = `${ALLOWED_ADDRESS},0xOther`;
    const app = createAllowlistApp();
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader(ALLOWED_ADDRESS) },
    });
    expect(res.status).toBe(200);
  });

  it("blocks wallet not in PRIM_ALLOWLIST env var", async () => {
    process.env.PRIM_ALLOWLIST = ALLOWED_ADDRESS;
    const app = createAllowlistApp();
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xNotAllowed") },
    });
    expect(res.status).toBe(403);
  });

  it("returns 402 (not 403) when allowlist is set but no payment header present", async () => {
    const app = createAllowlistApp([ALLOWED_ADDRESS]);
    const res = await app.request("/paid", { method: "GET" });
    // Should get 402 so client can learn payment requirements, not 403
    expect(res.status).toBe(402);
  });

  it("includes access_url in 403 response when accessUrl is set", async () => {
    const app = new Hono();
    app.use(
      "*",
      createAgentStackMiddleware(
        {
          payTo: TEST_PAY_TO,
          network: TEST_NETWORK,
          facilitatorUrl: "https://x402.example",
          freeRoutes: ["GET /free"],
          allowlist: [ALLOWED_ADDRESS],
          accessUrl: "https://prim.sh/access",
        },
        routes,
      ),
    );
    app.get("/free", (c) => c.json({ ok: true }));
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xBlockedAddress") },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.access_url).toBe("https://prim.sh/access");
    expect(body.message).toContain("https://prim.sh/access");
  });

  it("omits access_url when accessUrl is not set", async () => {
    const app = createAllowlistApp([ALLOWED_ADDRESS]);
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xBlockedAddress") },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.access_url).toBeUndefined();
    expect(body.message).toBe("This service is in private beta");
  });

  it("skips allowlist check when PRIM_ALLOWLIST is empty string", async () => {
    process.env.PRIM_ALLOWLIST = "";
    const app = createAllowlistApp();
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xAnyAddress") },
    });
    expect(res.status).toBe(200);
  });
});

describe("Dynamic allowlist (checkAllowlist callback)", () => {
  const ALLOWED_ADDRESS = "0xAllowedAddress";

  function makePaymentHeader(from: string) {
    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: TEST_NETWORK,
      payload: {
        authorization: {
          from,
          to: TEST_PAY_TO,
          value: "1000",
          validAfter: "0",
          validBefore: "9999999999",
          nonce: "0xnonce",
        },
        signature: "0xsignature",
      },
    };
    return encodePaymentSignatureHeader(paymentPayload as unknown as never);
  }

  function createDynamicApp(opts: Partial<AgentStackMiddlewareOptions> = {}) {
    const app = new Hono();
    app.use(
      "*",
      createAgentStackMiddleware(
        {
          payTo: TEST_PAY_TO,
          network: TEST_NETWORK,
          facilitatorUrl: "https://x402.example",
          freeRoutes: ["GET /free"],
          ...opts,
        },
        routes,
      ),
    );
    app.get("/free", (c) => c.json({ route: "free", walletAddress: c.get("walletAddress") }));
    app.get("/paid", (c) => c.json({ route: "paid", walletAddress: c.get("walletAddress") }));
    return app;
  }

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: env vars require delete to remove (= undefined sets "undefined")
    delete process.env.PRIM_ALLOWLIST;
  });

  it("allows wallet when checkAllowlist returns true", async () => {
    const checker = vi.fn(async () => true);
    const app = createDynamicApp({ checkAllowlist: checker });
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xDynamicWallet") },
    });
    expect(res.status).toBe(200);
    expect(checker).toHaveBeenCalledWith("0xdynamicwallet");
  });

  it("blocks wallet when checkAllowlist returns false", async () => {
    const checker = vi.fn(async () => false);
    const app = createDynamicApp({ checkAllowlist: checker });
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xBlockedWallet") },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("wallet_not_allowed");
  });

  it("does NOT call checkAllowlist if static allowlist already allows", async () => {
    const checker = vi.fn(async () => false);
    const app = createDynamicApp({
      allowlist: [ALLOWED_ADDRESS],
      checkAllowlist: checker,
    });
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader(ALLOWED_ADDRESS) },
    });
    expect(res.status).toBe(200);
    expect(checker).not.toHaveBeenCalled();
  });

  it("falls through to checkAllowlist when static allowlist misses", async () => {
    const checker = vi.fn(async () => true);
    const app = createDynamicApp({
      allowlist: [ALLOWED_ADDRESS],
      checkAllowlist: checker,
    });
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xOtherAddress") },
    });
    expect(res.status).toBe(200);
    expect(checker).toHaveBeenCalledWith("0xotheraddress");
  });

  it("backwards compatible: no checkAllowlist = current behavior (allow all)", async () => {
    const app = createDynamicApp(); // No allowlist, no checkAllowlist
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xAnyWallet") },
    });
    expect(res.status).toBe(200);
  });

  it("checkAllowlist works on paid routes (payment path)", async () => {
    const checker = vi.fn(async () => false);
    const app = createDynamicApp({ checkAllowlist: checker });
    const res = await app.request("/paid", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": makePaymentHeader("0xBlockedWallet") },
    });
    expect(res.status).toBe(403);
  });
});

// ─── Per-wallet rate limiting ─────────────────────────────────────────────

describe("Per-wallet rate limiting", () => {
  function makePaymentHeader(from: string) {
    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: TEST_NETWORK,
      payload: {
        authorization: {
          from,
          to: TEST_PAY_TO,
          value: "1000",
          validAfter: "0",
          validBefore: "999999999999",
          nonce: "0x01",
        },
        signature: `0x${"ab".repeat(65)}`,
      },
    };
    return encodePaymentSignatureHeader(paymentPayload);
  }

  function createRateLimitedApp(max = 2) {
    const app = new Hono();
    app.use(
      "*",
      createAgentStackMiddleware(
        {
          payTo: TEST_PAY_TO,
          network: TEST_NETWORK,
          facilitatorUrl: "https://x402.example",
          freeRoutes: ["GET /free"],
          rateLimit: { max, windowMs: 60_000 },
        },
        routes,
      ),
    );
    app.get("/free", (c) => c.json({ route: "free" }));
    app.get("/paid", (c) => c.json({ route: "paid" }));
    return app;
  }

  it("returns 429 after exceeding rate limit", async () => {
    const app = createRateLimitedApp(2);
    const header = makePaymentHeader("0xRateLimitTest");

    await app.request("/free", { method: "GET", headers: { "PAYMENT-SIGNATURE": header } });
    await app.request("/free", { method: "GET", headers: { "PAYMENT-SIGNATURE": header } });
    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": header },
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(typeof body.retry_after).toBe("number");
  });

  it("includes rate limit headers on allowed requests", async () => {
    const app = createRateLimitedApp(5);
    const header = makePaymentHeader("0xHeaderTest");

    const res = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": header },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("tracks different wallets independently", async () => {
    const app = createRateLimitedApp(1);
    const headerA = makePaymentHeader("0xWalletA");
    const headerB = makePaymentHeader("0xWalletB");

    await app.request("/free", { method: "GET", headers: { "PAYMENT-SIGNATURE": headerA } });
    const resA = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": headerA },
    });
    expect(resA.status).toBe(429);

    const resB = await app.request("/free", {
      method: "GET",
      headers: { "PAYMENT-SIGNATURE": headerB },
    });
    expect(resB.status).toBe(200);
  });

  it("does not rate limit requests without payment header", async () => {
    const app = createRateLimitedApp(1);

    const res1 = await app.request("/free", { method: "GET" });
    const res2 = await app.request("/free", { method: "GET" });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it("rateLimit: true uses defaults", () => {
    const app = new Hono();
    // Should not throw
    app.use(
      "*",
      createAgentStackMiddleware(
        {
          payTo: TEST_PAY_TO,
          network: TEST_NETWORK,
          freeRoutes: ["GET /free"],
          rateLimit: true,
        },
        { "GET /free": "$0.00" },
      ),
    );
  });
});
