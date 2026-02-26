import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPrimFetch } from "./packages/x402-client/src/client.ts";

const WALLET_API = "https://wallet.prim.sh";
const FAUCET_API = "https://faucet.prim.sh";
const STORE_API = "https://store.prim.sh";

// Step 1: Generate wallet
const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
console.log("Generated wallet:", account.address);
console.log("Private key:", privateKey);

// Step 2: Register wallet via EIP-191 signature
const timestamp = new Date().toISOString();
const message = `Register ${account.address} with prim.sh at ${timestamp}`;
const signature = await account.signMessage({ message });

const regRes = await fetch(`${WALLET_API}/v1/wallets`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: account.address, signature, timestamp }),
});
console.log("Register:", regRes.status, await regRes.json());

// Step 3: Get test USDC
const faucetRes = await fetch(`${FAUCET_API}/v1/faucet/usdc`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: account.address }),
});
console.log("Faucet:", faucetRes.status, await faucetRes.json());

// Step 4: Create a storage bucket via x402
const primFetch = createPrimFetch({
  signer: account,
  maxPayment: "1.00",
  network: "eip155:84532",
});

const bucketRes = await primFetch(`${STORE_API}/v1/buckets`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "asher-test" }),
});
console.log("Create bucket:", bucketRes.status, await bucketRes.json());
