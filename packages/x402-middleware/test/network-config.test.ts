import { describe, expect, it, vi } from "vitest";
import { getNetworkConfig } from "../src/network-config";

describe("network-config", () => {
  describe("Base mainnet (eip155:8453)", () => {
    const cfg = getNetworkConfig("eip155:8453");

    it("chainId is 8453", () => {
      expect(cfg.chainId).toBe(8453);
    });

    it("USDC address is correct", () => {
      expect(cfg.usdcAddress).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    });

    it("rpcUrl points to mainnet", () => {
      expect(cfg.rpcUrl).toBe("https://mainnet.base.org");
    });

    it("isTestnet is false", () => {
      expect(cfg.isTestnet).toBe(false);
    });
  });

  describe("Base Sepolia (eip155:84532)", () => {
    const cfg = getNetworkConfig("eip155:84532");

    it("chainId is 84532", () => {
      expect(cfg.chainId).toBe(84532);
    });

    it("USDC address is correct", () => {
      expect(cfg.usdcAddress).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    });

    it("rpcUrl points to Sepolia", () => {
      expect(cfg.rpcUrl).toBe("https://sepolia.base.org");
    });

    it("isTestnet is true", () => {
      expect(cfg.isTestnet).toBe(true);
    });
  });

  describe("default network", () => {
    it("PRIM_NETWORK=testnet env var selects testnet", () => {
      vi.stubEnv("PRIM_NETWORK", "eip155:84532");
      const cfg = getNetworkConfig();
      expect(cfg.chainId).toBe(84532);
      expect(cfg.isTestnet).toBe(true);
      vi.unstubAllEnvs();
    });

    it("explicit argument overrides PRIM_NETWORK env var", () => {
      vi.stubEnv("PRIM_NETWORK", "eip155:84532");
      const cfg = getNetworkConfig("eip155:8453");
      expect(cfg.chainId).toBe(8453);
      vi.unstubAllEnvs();
    });
  });

  it("throws on unknown network", () => {
    expect(() => getNetworkConfig("eip155:9999")).toThrow("Unknown network");
  });
});
