// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";

vi.mock("@primsh/x402-client", () => ({
  createPrimFetch: vi.fn(() => vi.fn()),
}));

import { createPrimFetch } from "@primsh/x402-client";
import { createPrimClient } from "../src/client.ts";
import { PrimError, unwrap } from "../src/shared.ts";

describe("createPrimClient", () => {
  it("returns an object with all prim namespaces", () => {
    const client = createPrimClient({ privateKey: "0xdead" });
    const expected = [
      "wallet", "store", "search", "spawn", "email", "token",
      "mem", "domain", "track", "infer", "create", "imagine",
      "faucet", "gate",
    ];
    for (const ns of expected) {
      expect(client).toHaveProperty(ns);
      expect(typeof client[ns as keyof typeof client]).toBe("object");
    }
  });

  it("passes config to createPrimFetch", () => {
    const config = { privateKey: "0xdead" as const, maxPayment: "5.00", network: "eip155:84532" };
    createPrimClient(config);
    expect(createPrimFetch).toHaveBeenCalledWith(config);
  });

  it("wallet namespace has expected methods", () => {
    const client = createPrimClient({ privateKey: "0xdead" });
    expect(typeof client.wallet.registerWallet).toBe("function");
    expect(typeof client.wallet.listWallets).toBe("function");
    expect(typeof client.wallet.getWallet).toBe("function");
  });

  it("store namespace has expected methods", () => {
    const client = createPrimClient({ privateKey: "0xdead" });
    expect(typeof client.store.createBucket).toBe("function");
    expect(typeof client.store.listBuckets).toBe("function");
    expect(typeof client.store.putObject).toBe("function");
  });
});

describe("PrimError", () => {
  it("extends Error", () => {
    const err = new PrimError(404, "not_found", "Wallet not found");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PrimError);
  });

  it("has status, code, and message", () => {
    const err = new PrimError(422, "invalid_input", "Bad request body");
    expect(err.status).toBe(422);
    expect(err.code).toBe("invalid_input");
    expect(err.message).toBe("Bad request body");
    expect(err.name).toBe("PrimError");
  });

  it("is caught by catch(Error) blocks", () => {
    let caught = false;
    try {
      throw new PrimError(500, "internal", "boom");
    } catch (e) {
      if (e instanceof Error) caught = true;
    }
    expect(caught).toBe(true);
  });
});

describe("unwrap", () => {
  it("returns parsed JSON on 200", async () => {
    const res = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const data = await unwrap<{ ok: boolean }>(res);
    expect(data).toEqual({ ok: true });
  });

  it("returns undefined on 204 No Content", async () => {
    const res = new Response(null, { status: 204 });
    const data = await unwrap<void>(res);
    expect(data).toBeUndefined();
  });

  it("throws PrimError on 4xx with error body", async () => {
    const body = { error: { code: "wallet_not_found", message: "No such wallet" } };
    const res = new Response(JSON.stringify(body), { status: 404 });
    await expect(unwrap(res)).rejects.toThrow(PrimError);
    try {
      await unwrap(new Response(JSON.stringify(body), { status: 404 }));
    } catch (e) {
      expect(e).toBeInstanceOf(PrimError);
      const pe = e as PrimError;
      expect(pe.status).toBe(404);
      expect(pe.code).toBe("wallet_not_found");
      expect(pe.message).toBe("No such wallet");
    }
  });

  it("throws PrimError with fallback on non-JSON error body", async () => {
    const res = new Response("Internal Server Error", { status: 500 });
    try {
      await unwrap(res);
    } catch (e) {
      expect(e).toBeInstanceOf(PrimError);
      const pe = e as PrimError;
      expect(pe.status).toBe(500);
      expect(pe.code).toBe("unknown");
      expect(pe.message).toBe("HTTP 500");
    }
  });
});
