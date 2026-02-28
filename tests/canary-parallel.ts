/**
 * Parallel canary test — N agents run the full bootstrap flow concurrently:
 *   register wallet → drip USDC → spawn VPS → poll active → destroy
 *
 * Finds concurrency bottlenecks in the prim stack.
 *
 * Usage: bun run tests/canary-parallel.ts [--agents N]
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPrimFetch } from "../packages/x402-client/src/client.ts";

const WALLET_API = process.env.WALLET_API ?? "https://wallet.prim.sh";
const FAUCET_API = process.env.FAUCET_API ?? "https://faucet.prim.sh";
const SPAWN_API = process.env.SPAWN_API ?? "https://spawn.prim.sh";

const AGENT_COUNT = Number(process.argv.find((_, i, a) => a[i - 1] === "--agents") ?? "3");

interface AgentResult {
  id: number;
  address: string;
  steps: Record<string, { ok: boolean; ms: number; detail?: string }>;
  serverId?: string;
  serverIp?: string;
  totalMs: number;
  passed: boolean;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - start) };
}

async function runAgent(id: number): Promise<AgentResult> {
  const steps: AgentResult["steps"] = {};
  const agentStart = performance.now();
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const tag = `[agent-${id}]`;
  let serverId: string | undefined;
  let serverIp: string | undefined;

  console.log(`${tag} wallet: ${account.address}`);

  // ── Register ────────────────────────────────────────────────────────────
  try {
    const { result: res, ms } = await timed(async () => {
      const timestamp = new Date().toISOString();
      const message = `Register ${account.address} with prim.sh at ${timestamp}`;
      const signature = await account.signMessage({ message });
      return fetch(`${WALLET_API}/v1/wallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.address, signature, timestamp }),
      });
    });
    const ok = res.status === 200 || res.status === 201;
    steps.register = { ok, ms, detail: `${res.status}` };
    console.log(`${tag} register: ${res.status} (${ms}ms)`);
    if (!ok) return finish();
  } catch (e) {
    steps.register = { ok: false, ms: 0, detail: String(e) };
    return finish();
  }

  // ── Drip USDC ───────────────────────────────────────────────────────────
  try {
    const { result: res, ms } = await timed(() =>
      fetch(`${FAUCET_API}/v1/faucet/usdc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.address }),
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;
    const ok = res.status === 200;
    steps.drip_usdc = { ok, ms, detail: ok ? `${body.amount} USDC` : `${res.status} ${(body as any).error?.code}` };
    console.log(`${tag} drip_usdc: ${steps.drip_usdc.detail} (${ms}ms)`);
    if (!ok) return finish();
  } catch (e) {
    steps.drip_usdc = { ok: false, ms: 0, detail: String(e) };
    return finish();
  }

  // ── Wait for on-chain settlement ────────────────────────────────────────
  console.log(`${tag} waiting 15s for settlement...`);
  await new Promise((r) => setTimeout(r, 15_000));

  // ── Spawn ───────────────────────────────────────────────────────────────
  try {
    const primFetch = createPrimFetch({
      signer: account,
      maxPayment: "1.00",
      network: "eip155:84532",
    });

    const { result: res, ms } = await timed(() =>
      primFetch(`${SPAWN_API}/v1/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `canary-${id}-${Date.now().toString(36)}`,
          type: "small",
          image: "ubuntu-24.04",
          location: "nyc3",
        }),
      }),
    );
    const body = (await res.json()) as Record<string, any>;
    const ok = res.status === 200 || res.status === 201;
    serverId = body.server?.id;
    steps.spawn = { ok, ms, detail: ok ? serverId : `${res.status} ${body.error?.code ?? body.error?.message}` };
    console.log(`${tag} spawn: ${steps.spawn.detail} (${ms}ms)`);
    if (!ok) return finish();

    // ── Poll until active ─────────────────────────────────────────────────
    const { ms: pollMs } = await timed(async () => {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 5_000));
        const pollRes = await primFetch(`${SPAWN_API}/v1/servers/${serverId}`);
        const pollBody = (await pollRes.json()) as Record<string, any>;
        const status = pollBody.server?.status ?? pollBody.status;
        const ip = pollBody.server?.public_net?.ipv4?.ip;
        if (status === "active") {
          serverIp = ip;
          return true;
        }
      }
      return false;
    });
    const active = !!serverIp;
    steps.poll_active = { ok: active, ms: pollMs, detail: active ? `${serverIp}` : "timeout" };
    console.log(`${tag} active: ${steps.poll_active.detail} (${pollMs}ms)`);

    // ── Destroy ───────────────────────────────────────────────────────────
    const { result: delRes, ms: delMs } = await timed(() =>
      primFetch(`${SPAWN_API}/v1/servers/${serverId}`, { method: "DELETE" }),
    );
    steps.destroy = { ok: delRes.status === 200, ms: delMs, detail: `${delRes.status}` };
    console.log(`${tag} destroy: ${delRes.status} (${delMs}ms)`);
  } catch (e) {
    steps.spawn = steps.spawn ?? { ok: false, ms: 0, detail: String(e) };
    return finish();
  }

  function finish(): AgentResult {
    return {
      id,
      address: account.address,
      steps,
      serverId,
      serverIp,
      totalMs: Math.round(performance.now() - agentStart),
      passed: Object.values(steps).every((s) => s.ok),
    };
  }

  return finish();
}

// ── Main ──────────────────────────────────────────────────────────────────

console.log(`\n=== Parallel Canary: ${AGENT_COUNT} agents ===\n`);
const start = performance.now();

const results = await Promise.allSettled(
  Array.from({ length: AGENT_COUNT }, (_, i) => runAgent(i + 1)),
);

const agents = results.map((r) =>
  r.status === "fulfilled" ? r.value : { id: -1, address: "?", steps: {}, totalMs: 0, passed: false },
);

console.log("\n=== Results ===\n");
for (const a of agents) {
  const status = a.passed ? "PASS" : "FAIL";
  const stepSummary = Object.entries(a.steps)
    .map(([k, v]) => `${k}:${v.ok ? "ok" : "FAIL"}(${v.ms}ms)`)
    .join(" → ");
  console.log(`  agent-${a.id} [${status}] ${a.totalMs}ms — ${stepSummary}`);
}

const passed = agents.filter((a) => a.passed).length;
const failed = agents.length - passed;
const wallTime = Math.round(performance.now() - start);
console.log(`\n  ${passed}/${agents.length} passed, ${failed} failed, wall time: ${wallTime}ms\n`);

process.exit(failed > 0 ? 1 : 0);
