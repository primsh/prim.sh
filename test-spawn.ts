import { privateKeyToAccount } from "viem/accounts";
import { createPrimFetch } from "./packages/x402-client/src/client.ts";

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
const primFetch = createPrimFetch({ signer: account, maxPayment: "1.00", network: "eip155:84532" });
const SPAWN = "https://spawn.prim.sh";

async function api(method: string, path: string, body?: unknown) {
  const res = await primFetch(`${SPAWN}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  console.log(`${method} ${path} → ${res.status}`, JSON.stringify(json, null, 2));
  return { status: res.status, data: json as Record<string, unknown> };
}

// Step 1: Create server
console.log("=== Creating server ===");
const { data: createData } = await api("POST", "/v1/servers", {
  name: "asher-test",
  type: "small",
  image: "ubuntu-24.04",
  location: "nyc3",
});

// biome-ignore lint/suspicious/noExplicitAny: untyped API response
const serverId = (createData as any)?.server?.id ?? (createData as any)?.id;
if (!serverId) {
  console.log("No server ID returned, stopping.");
  process.exit(1);
}
console.log(`\nServer ID: ${serverId}`);

// Step 2: Poll until active
console.log("\n=== Polling for active status ===");
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const { data } = await api("GET", `/v1/servers/${serverId}`);
  // biome-ignore lint/suspicious/noExplicitAny: untyped API response
  const status = (data as any)?.server?.status ?? (data as any)?.status;
  if (status === "active") {
    console.log("\nServer is active!");
    break;
  }
  if (i === 29) console.log("\nTimed out waiting for active status.");
}

// Step 3: Destroy
console.log("\n=== Destroying server ===");
await api("DELETE", `/v1/servers/${serverId}`);
console.log("Done.");
