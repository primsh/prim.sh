// SPDX-License-Identifier: Apache-2.0
/**
 * API route integration tests: health check, signature registration, x402 gating.
 *
 * Rewritten in W-10 for non-custodial registration (EIP-191 signature).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";
  process.env.WALLET_DB_PATH = ":memory:";
});

import { encodePaymentSignatureHeader } from "@x402/core/http";
import { getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

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
let resetDb: typeof import("../src/db.ts")["resetDb"];

beforeAll(async () => {
  vi.stubGlobal("fetch", mockFetch);
  const db = await import("../src/db.ts");
  resetDb = db.resetDb;
  app = (await import("../src/index")).default;
});

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("wallet.sh API", () => {
  it("GET / returns 200 with service and status", async () => {
    const res = await app.request("/", { method: "GET" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "wallet.sh", status: "ok" });
  });

  it("POST /v1/wallets (free) registers with valid signature", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const timestamp = new Date().toISOString();
    const address = getAddress(account.address);
    const message = `Register ${address} with prim.sh at ${timestamp}`;
    const signature = await account.signMessage({ message });

    const res = await app.request("/v1/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account.address, signature, timestamp }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      address,
      chain: "eip155:8453",
    });
    expect(body.registered_at).toBeDefined();
  });

  it("GET /v1/wallets without payment returns 402", async () => {
    const res = await app.request("/v1/wallets", { method: "GET" });
    expect(res.status).toBe(402);
    expect(res.headers.get("Payment-Required")).toBeTruthy();
  });

  it("paid route with unregistered wallet returns 403", async () => {
    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: NETWORK,
      payload: {
        authorization: {
          from: "0xPayerAddress",
          to: "0x0000000000000000000000000000000000000000",
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

    // Allowlist gate rejects unregistered wallets before x402 payment validation
    expect(res.status).toBe(403);
  });
});
