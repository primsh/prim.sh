import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { encodePaymentSignatureHeader } from "@x402/core/http";

const PAY_TO = "0x0000000000000000000000000000000000000000";
const NETWORK = "eip155:8453";

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
        kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
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

let app: Awaited<typeof import("../src/index")>["default"];

beforeAll(async () => {
  vi.stubGlobal("fetch", mockFetch);
  app = (await import("../src/index")).default;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("wallet.sh API stubs", () => {
  it("GET / returns 200 with service and status", async () => {
    const res = await app.request("/", { method: "GET" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "wallet.sh", status: "ok" });
  });

  it("POST /v1/wallets (free) returns 201 with stub create response", async () => {
    const res = await app.request("/v1/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "eip155:8453" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      address: expect.any(String),
      chain: "eip155:8453",
      balance: "0.00",
      funded: false,
      claimToken: "ctk_stub",
    });
    expect(body.createdAt).toBeDefined();
  });

  it("GET /v1/wallets without payment returns 402", async () => {
    const res = await app.request("/v1/wallets", { method: "GET" });
    expect(res.status).toBe(402);
    expect(res.headers.get("Payment-Required")).toBeTruthy();
  });

  it("POST /v1/wallets/:address/send without payment returns 402", async () => {
    const res = await app.request("/v1/wallets/0x123/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "0x456",
        amount: "10.00",
        idempotencyKey: "idk_1",
      }),
    });
    expect(res.status).toBe(402);
    expect(res.headers.get("Payment-Required")).toBeTruthy();
  });

  it("paid route with payment header returns 501 and not_implemented error", async () => {
    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: NETWORK,
      payload: {
        authorization: {
          from: "0xPayerAddress",
          to: PAY_TO,
          value: "1000",
          validAfter: "0",
          validBefore: "9999999999",
          nonce: "0xnonce",
        },
        signature: "0xsignature",
      },
    };
    const header = encodePaymentSignatureHeader(paymentPayload as unknown as never);

    const res = await app.request("/v1/wallets", {
      method: "GET",
      headers: { "Payment-Signature": header },
    });

    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body).toMatchObject({
      error: { code: "not_implemented", message: expect.any(String) },
    });
  });
});
