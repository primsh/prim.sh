/**
 * token.sh live smoke test — Base Sepolia
 *
 * Calls service functions directly (bypasses x402 middleware).
 * Requires funded deployer wallet on Base Sepolia.
 *
 * Run:
 *   TOKEN_MASTER_KEY=<64hex> \
 *   TOKEN_DEPLOYER_ENCRYPTED_KEY=<blob> \
 *   BASE_RPC_URL=https://sepolia.base.org \
 *   BASE_CHAIN_ID=84532 \
 *   TOKEN_DB_PATH=./token-testnet.db \
 *   bun run vitest --run test/smoke-live.test.ts
 *
 * Skip (default): tests are skipped when SMOKE_LIVE=1 is not set.
 */

import { describe, it, expect, afterAll } from "vitest";
import { resetDb } from "../src/db.ts";
import { deployToken, getToken, mintTokens, getSupply } from "../src/service.ts";

const SMOKE = process.env.SMOKE_LIVE === "1";
const liveIt = SMOKE ? it : it.skip;

const OWNER = process.env.SMOKE_OWNER_WALLET ?? "0x0000000000000000000000000000000000000001";

afterAll(() => {
  resetDb();
});

describe("token.sh smoke test (Base Sepolia)", () => {
  let nonMintableId: string;
  let mintableId: string;

  liveIt("deploys a non-mintable token and confirms on-chain", async () => {
    const result = await deployToken(
      { name: "Smoke Token", symbol: "SMOKE", decimals: 18, initialSupply: "1000" },
      OWNER,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.token.deploy_status).toBe("confirmed");
    expect(result.data.token.contract_address).toBeTruthy();
    console.log("Non-mintable token:", result.data.token.contract_address);
    nonMintableId = result.data.token.id;
  });

  liveIt("getToken returns correct fields", async () => {
    const result = getToken(nonMintableId, OWNER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.token.name).toBe("Smoke Token");
    expect(result.data.token.decimals).toBe(18);
    expect(result.data.token.mintable).toBe(false);
  });

  liveIt("getSupply returns on-chain totalSupply matching initialSupply", async () => {
    const result = await getSupply(nonMintableId, OWNER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total_supply).toBe("1000");
  });

  liveIt("deploys a mintable token with decimals:6", async () => {
    const result = await deployToken(
      {
        name: "Mint6 Token",
        symbol: "MINT6",
        decimals: 6,
        initialSupply: "1000000",
        mintable: true,
        maxSupply: "2000000",
      },
      OWNER,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.token.deploy_status).toBe("confirmed");
    console.log("Mintable token:", result.data.token.contract_address);
    mintableId = result.data.token.id;
  });

  liveIt("mints within cap succeeds", async () => {
    const result = await mintTokens(mintableId, { to: OWNER, amount: "500000" }, OWNER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("pending");
  });

  liveIt("on-chain supply after mint is 1500000", async () => {
    const result = await getSupply(mintableId, OWNER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total_supply).toBe("1500000");
  });

  liveIt("mint exceeding maxSupply returns 422", async () => {
    // Already minted 500000, so 1500000 total. maxSupply=2000000. Minting 600000 → 2100000 > 2000000
    const result = await mintTokens(mintableId, { to: OWNER, amount: "600000" }, OWNER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(result.code).toBe("exceeds_max_supply");
  });

  liveIt("non-owner mint returns 403", async () => {
    const OTHER = "0x0000000000000000000000000000000000000002";
    const result = await mintTokens(mintableId, { to: OWNER, amount: "100" }, OTHER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  liveIt("deploys a zero-decimal token (NFT-like)", async () => {
    const result = await deployToken(
      { name: "Zero Dec Token", symbol: "ZDT", decimals: 0, initialSupply: "100" },
      OWNER,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.token.deploy_status).toBe("confirmed");
    const supply = await getSupply(result.data.token.id, OWNER);
    expect(supply.ok).toBe(true);
    if (!supply.ok) return;
    expect(supply.data.total_supply).toBe("100");
  });
});
