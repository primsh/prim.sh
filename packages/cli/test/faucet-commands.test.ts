/**
 * faucet-commands.ts unit tests.
 *
 * Uses global fetch mock (no x402 — faucet is free).
 * getDefaultAddress is mocked to control address resolution.
 */

import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@primsh/keystore", () => ({
  getDefaultAddress: vi.fn(),
}));

import { getDefaultAddress } from "@primsh/keystore";
import { resolveFaucetUrl, runFaucetCommand } from "../src/faucet-commands.ts";

// --- Helpers ----------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okDrip(currency: string) {
  return jsonResponse(200, {
    tx_hash: "0xabc123",
    amount: currency === "usdc" ? "1.0" : "0.01",
    currency: currency.toUpperCase(),
    chain: "base-sepolia",
  });
}

function okStatus(usdcAvailable = true, ethAvailable = true) {
  return jsonResponse(200, {
    address: "0xTEST",
    usdc: { available: usdcAvailable, retry_after_ms: usdcAvailable ? 0 : 3600000 },
    eth: { available: ethAvailable, retry_after_ms: ethAvailable ? 0 : 1800000 },
  });
}

function errorResponse(code: string, message: string, status = 400) {
  return jsonResponse(status, { error: { code, message } });
}

// --- Setup ------------------------------------------------------------------

let fetchSpy: MockInstance;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let consoleLogSpy: MockInstance<any[], any>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let stderrSpy: MockInstance<any[], any>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let exitSpy: MockInstance<any[], never>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(okDrip("usdc"));
  vi.mocked(getDefaultAddress).mockResolvedValue("0xDEFAULT");
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
    throw new Error(`process.exit(${_code})`);
  });
  // biome-ignore lint/performance/noDelete: env var must be absent, not the string "undefined"
  delete process.env.PRIM_FAUCET_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  // biome-ignore lint/performance/noDelete: env var must be absent, not the string "undefined"
  delete process.env.PRIM_FAUCET_URL;
});

// --- 1. usdc ----------------------------------------------------------------

describe("usdc", () => {
  it("POSTs to /v1/faucet/usdc with address and prints JSON", async () => {
    fetchSpy.mockResolvedValue(okDrip("usdc"));
    await runFaucetCommand("usdc", ["faucet", "usdc", "0xABC"]);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://faucet.prim.sh/v1/faucet/usdc",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ address: "0xABC" }),
      }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("0xabc123"));
  });

  it("uses default address when none provided", async () => {
    fetchSpy.mockResolvedValue(okDrip("usdc"));
    await runFaucetCommand("usdc", ["faucet", "usdc"]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: JSON.stringify({ address: "0xDEFAULT" }),
      }),
    );
  });

  it("--quiet prints only txHash", async () => {
    fetchSpy.mockResolvedValue(okDrip("usdc"));
    await runFaucetCommand("usdc", ["faucet", "usdc", "0xABC", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledWith("0xabc123");
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });
});

// --- 2. eth -----------------------------------------------------------------

describe("eth", () => {
  it("POSTs to /v1/faucet/eth with address and prints JSON", async () => {
    fetchSpy.mockResolvedValue(okDrip("eth"));
    await runFaucetCommand("eth", ["faucet", "eth", "0xABC"]);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://faucet.prim.sh/v1/faucet/eth",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ address: "0xABC" }),
      }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("0xabc123"));
  });

  it("uses default address when none provided", async () => {
    fetchSpy.mockResolvedValue(okDrip("eth"));
    await runFaucetCommand("eth", ["faucet", "eth"]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: JSON.stringify({ address: "0xDEFAULT" }),
      }),
    );
  });

  it("--quiet prints only txHash", async () => {
    fetchSpy.mockResolvedValue(okDrip("eth"));
    await runFaucetCommand("eth", ["faucet", "eth", "0xABC", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledWith("0xabc123");
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });
});

// --- 3. status --------------------------------------------------------------

describe("status", () => {
  it("GETs /v1/faucet/status with address query param", async () => {
    fetchSpy.mockResolvedValue(okStatus());
    await runFaucetCommand("status", ["faucet", "status", "0xABC"]);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("/v1/faucet/status");
    expect(url).toContain("address=0xABC");
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("0xTEST"));
  });

  it("uses default address when none provided", async () => {
    fetchSpy.mockResolvedValue(okStatus());
    await runFaucetCommand("status", ["faucet", "status"]);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("address=0xDEFAULT");
  });

  it("--quiet prints usdc:available eth:available booleans", async () => {
    fetchSpy.mockResolvedValue(okStatus(true, false));
    await runFaucetCommand("status", ["faucet", "status", "0xABC", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledWith("usdc:true eth:false");
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });
});

// --- 4. address resolution --------------------------------------------------

describe("address resolution", () => {
  it("explicit address takes priority over default", async () => {
    fetchSpy.mockResolvedValue(okDrip("usdc"));
    await runFaucetCommand("usdc", ["faucet", "usdc", "0xEXPLICIT"]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: JSON.stringify({ address: "0xEXPLICIT" }),
      }),
    );
  });

  it("falls back to default wallet address", async () => {
    vi.mocked(getDefaultAddress).mockResolvedValue("0xMYWALLET");
    fetchSpy.mockResolvedValue(okDrip("usdc"));
    await runFaucetCommand("usdc", ["faucet", "usdc"]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: JSON.stringify({ address: "0xMYWALLET" }),
      }),
    );
  });

  it("exits 1 when no address and no default wallet", async () => {
    vi.mocked(getDefaultAddress).mockResolvedValue(null);
    await expect(runFaucetCommand("usdc", ["faucet", "usdc"])).rejects.toThrow("process.exit(1)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("No address provided"));
  });

  it("does not treat flags as positional address", async () => {
    vi.mocked(getDefaultAddress).mockResolvedValue("0xDEFAULT");
    fetchSpy.mockResolvedValue(okDrip("usdc"));
    await runFaucetCommand("usdc", ["faucet", "usdc", "--quiet"]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: JSON.stringify({ address: "0xDEFAULT" }),
      }),
    );
  });
});

// --- 5. error handling ------------------------------------------------------

describe("error handling", () => {
  it("non-ok response throws error with message and code", async () => {
    fetchSpy.mockResolvedValue(errorResponse("rate_limited", "Next drip in 30 minutes", 429));
    await expect(runFaucetCommand("usdc", ["faucet", "usdc", "0xABC"])).rejects.toThrow(
      "Next drip in 30 minutes (rate_limited)",
    );
  });

  it("400 invalid request error is reported correctly", async () => {
    fetchSpy.mockResolvedValue(errorResponse("invalid_request", "Valid address required", 400));
    await expect(runFaucetCommand("eth", ["faucet", "eth", "0xBAD"])).rejects.toThrow(
      "Valid address required (invalid_request)",
    );
  });
});

// --- 6. URL resolution ------------------------------------------------------

describe("URL resolution", () => {
  it("--url flag takes highest priority", () => {
    process.env.PRIM_FAUCET_URL = "https://env.example.com";
    const url = resolveFaucetUrl(["faucet", "usdc", "--url=https://flag.example.com"]);
    expect(url).toBe("https://flag.example.com");
  });

  it("--url VALUE (space-separated) is accepted", () => {
    const url = resolveFaucetUrl(["faucet", "usdc", "--url", "https://space.example.com"]);
    expect(url).toBe("https://space.example.com");
  });

  it("PRIM_FAUCET_URL env is used when no --url flag", () => {
    process.env.PRIM_FAUCET_URL = "https://env.example.com";
    const url = resolveFaucetUrl(["faucet", "usdc"]);
    expect(url).toBe("https://env.example.com");
  });

  it("falls back to https://faucet.prim.sh", () => {
    // biome-ignore lint/performance/noDelete: env var must be absent, not the string "undefined"
    delete process.env.PRIM_FAUCET_URL;
    const url = resolveFaucetUrl(["faucet", "usdc"]);
    expect(url).toBe("https://faucet.prim.sh");
  });

  it("integration: runFaucetCommand uses --url for fetch calls", async () => {
    fetchSpy.mockResolvedValue(okDrip("usdc"));
    await runFaucetCommand("usdc", ["faucet", "usdc", "0xABC", "--url=https://custom.prim.sh"]);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("https://custom.prim.sh/v1/faucet/usdc");
  });
});

// --- 7. unknown subcommand --------------------------------------------------

describe("unknown subcommand", () => {
  it("prints usage and exits 1", async () => {
    await expect(runFaucetCommand("bogus", ["faucet", "bogus"])).rejects.toThrow("process.exit(1)");
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });
});
