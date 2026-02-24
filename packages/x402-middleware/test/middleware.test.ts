import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { Hono } from "hono";
import {
  createAgentStackMiddleware,
  type AgentStackRouteConfig,
} from "../src/middleware.ts";
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";

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
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : input.toString();
  if (url.endsWith("/supported")) {
    return new Response(
      JSON.stringify({
        kinds: [
          { x402Version: 2, scheme: "exact", network: TEST_NETWORK },
        ],
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

    const header = encodePaymentSignatureHeader(
      paymentPayload as unknown as never,
    );

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

