/**
 * Canary spawn test — full agent bootstrap flow:
 * 1. Generate wallet
 * 2. Register at wallet.sh
 * 3. Drip USDC + ETH from faucet.sh
 * 4. Spawn a VPS via spawn.sh (x402 paid)
 * 5. Poll until active
 * 6. Destroy
 *
 * Usage: AGENT_PRIVATE_KEY=0x... bun run tests/canary-spawn.ts
 *   or omit AGENT_PRIVATE_KEY to generate a fresh wallet
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPrimFetch } from "../packages/x402-client/src/client.ts";

const WALLET_API = process.env.WALLET_API ?? "https://wallet.prim.sh";
const FAUCET_API = process.env.FAUCET_API ?? "https://faucet.prim.sh";
const SPAWN_API = process.env.SPAWN_API ?? "https://spawn.prim.sh";

const privateKey = (process.env.AGENT_PRIVATE_KEY as `0x${string}`) ?? generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log(`\n--- Canary Spawn Test ---`);
console.log(`Wallet: ${account.address}\n`);

// ── Step 1: Register wallet ─────────────────────────────────────────────

console.log("[1/6] Registering wallet...");
const timestamp = new Date().toISOString();
const message = `Register ${account.address} with prim.sh at ${timestamp}`;
const signature = await account.signMessage({ message });

const regRes = await fetch(`${WALLET_API}/v1/wallets`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: account.address, signature, timestamp }),
});
const regBody = await regRes.json();
if (regRes.status !== 200 && regRes.status !== 201 && regRes.status !== 409) {
  console.error("Registration failed:", regRes.status, regBody);
  process.exit(1);
}
console.log(`  OK (${regRes.status})\n`);

// ── Step 2: Drip USDC ──────────────────────────────────────────────────

console.log("[2/6] Dripping USDC...");
const usdcRes = await fetch(`${FAUCET_API}/v1/faucet/usdc`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: account.address }),
});
const usdcBody = await usdcRes.json();
if (usdcRes.status !== 200) {
  console.error("USDC drip failed:", usdcRes.status, usdcBody);
  process.exit(1);
}
console.log(`  OK — ${(usdcBody as any).amount} USDC (tx: ${(usdcBody as any).tx_hash})\n`);

// ── Step 3: Drip ETH ───────────────────────────────────────────────────

console.log("[3/6] Dripping ETH...");
const ethRes = await fetch(`${FAUCET_API}/v1/faucet/eth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: account.address }),
});
const ethBody = await ethRes.json();
if (ethRes.status !== 200) {
  console.error("ETH drip failed:", ethRes.status, ethBody);
  process.exit(1);
}
console.log(`  OK — ${(ethBody as any).amount} ETH (tx: ${(ethBody as any).tx_hash})\n`);

// ── Step 4: Wait for on-chain settlement ────────────────────────────────

console.log("[4/6] Waiting 10s for on-chain settlement...");
await new Promise((r) => setTimeout(r, 10_000));
console.log("  Done.\n");

// ── Step 5: Spawn server ────────────────────────────────────────────────

console.log("[5/6] Spawning server via x402...");
const primFetch = createPrimFetch({
  signer: account,
  maxPayment: "1.00",
  network: "eip155:84532",
});

const spawnRes = await primFetch(`${SPAWN_API}/v1/servers`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: `canary-${Date.now().toString(36)}`,
    type: "small",
    image: "ubuntu-24.04",
    location: "nyc3",
  }),
});
const spawnBody = (await spawnRes.json()) as Record<string, any>;
if (spawnRes.status !== 200 && spawnRes.status !== 201) {
  console.error("Spawn failed:", spawnRes.status, spawnBody);
  process.exit(1);
}
const serverId = spawnBody.server?.id;
console.log(`  OK — server ${serverId} (status: ${spawnBody.server?.status})\n`);

// ── Step 6: Poll until active, then destroy ─────────────────────────────

console.log("[6/6] Polling for active status...");
let active = false;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5_000));
  const pollRes = await primFetch(`${SPAWN_API}/v1/servers/${serverId}`);
  const pollBody = (await pollRes.json()) as Record<string, any>;
  const status = pollBody.server?.status ?? pollBody.status;
  const ip = pollBody.server?.public_net?.ipv4;
  process.stdout.write(`  ${i + 1}/30 — status: ${status}${ip ? ` (${ip})` : ""}\n`);
  if (status === "active") {
    active = true;
    break;
  }
}

if (!active) {
  console.error("\nTimed out waiting for active status.");
}

console.log("\nDestroying server...");
const delRes = await primFetch(`${SPAWN_API}/v1/servers/${serverId}`, { method: "DELETE" });
console.log(`  ${delRes.status === 200 ? "OK" : `Failed (${delRes.status})`}`);

console.log(`\n--- Canary ${active ? "PASSED" : "FAILED"} ---\n`);
process.exit(active ? 0 : 1);
