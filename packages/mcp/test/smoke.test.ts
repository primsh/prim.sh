import { describe, expect, it, vi } from "vitest";

// Check 1: startMcpServer export defined
import { isPrimitive, startMcpServer } from "../src/server.ts";

import { faucetTools, handleFaucetTool } from "../src/tools/faucet.ts";
// Check 3: Tool arrays
import { handleWalletTool, walletTools } from "../src/tools/wallet.ts";

describe("MCP package smoke tests", () => {
  // Check 1: startMcpServer export is defined
  it("startMcpServer is exported and is a function", () => {
    expect(startMcpServer).toBeDefined();
    expect(typeof startMcpServer).toBe("function");
  });

  // Check 2: isPrimitive type guard returns correct results
  it("isPrimitive correctly identifies valid and invalid primitives", () => {
    expect(isPrimitive("wallet")).toBe(true);
    expect(isPrimitive("faucet")).toBe(true);
    expect(isPrimitive("store")).toBe(true);
    expect(isPrimitive("spawn")).toBe(true);
    expect(isPrimitive("notreal")).toBe(false);
    expect(isPrimitive("")).toBe(false);
    expect(isPrimitive("WALLET")).toBe(false);
  });

  // Check 3: Tool arrays include expected tools with required properties
  it("walletTools array contains tools with required MCP properties", () => {
    expect(walletTools.length).toBeGreaterThan(0);
    expect(walletTools[0]).toHaveProperty("name");
    expect(walletTools[0]).toHaveProperty("description");
    expect(walletTools[0]).toHaveProperty("inputSchema");
    expect(walletTools.some((t) => t.name === "wallet_list_wallets")).toBe(true);
  });

  it("faucetTools array contains tools with required MCP properties", () => {
    expect(faucetTools.length).toBeGreaterThan(0);
    expect(faucetTools[0]).toHaveProperty("name");
    expect(faucetTools[0]).toHaveProperty("description");
    expect(faucetTools[0]).toHaveProperty("inputSchema");
    expect(faucetTools.some((t) => t.name === "faucet_drip_usdc")).toBe(true);
    expect(faucetTools.some((t) => t.name === "faucet_drip_eth")).toBe(true);
    expect(faucetTools.some((t) => t.name === "faucet_get_faucet_status")).toBe(true);
  });

  // Check 4: Happy path — handler returns valid CallToolResult shape
  it("handleWalletTool returns valid CallToolResult on success", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ wallets: [] }), { status: 200 }));

    const result = await handleWalletTool(
      "wallet_list_wallets",
      {},
      mockFetch as unknown as typeof fetch,
      "https://wallet.prim.sh",
    );

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.isError).toBeFalsy();
  });

  it("handleFaucetTool returns valid CallToolResult on success", async () => {
    const mockFetchGlobal = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ txHash: "0xabc", amount: "10" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", mockFetchGlobal);

    const result = await handleFaucetTool(
      "faucet_drip_usdc",
      { address: "0x0000000000000000000000000000000000000001" },
      "https://faucet.prim.sh",
    );

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.isError).toBeFalsy();

    vi.unstubAllGlobals();
  });

  // Check 5: Error path — handler returns isError on fetch failure
  it("handleWalletTool returns isError on non-OK response", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "not found" }), { status: 404 }));

    const result = await handleWalletTool(
      "wallet_list_wallets",
      {},
      mockFetch as unknown as typeof fetch,
      "https://wallet.prim.sh",
    );

    expect(result.isError).toBe(true);
  });

  it("handleFaucetTool returns isError on non-OK response", async () => {
    const mockFetchGlobal = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }));
    vi.stubGlobal("fetch", mockFetchGlobal);

    const result = await handleFaucetTool(
      "faucet_drip_usdc",
      { address: "0x0000000000000000000000000000000000000001" },
      "https://faucet.prim.sh",
    );

    expect(result.isError).toBe(true);

    vi.unstubAllGlobals();
  });
});
