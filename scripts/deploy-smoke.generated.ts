#!/usr/bin/env bun
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: scripts/gen-deploy-smoke.ts + packages/*/prim.yaml
// Regenerate: pnpm gen:deploy-smoke

/**
 * deploy-smoke.generated.ts — Post-deploy smoke test
 *
 * For each mainnet primitive:
 *   1. GET https://<endpoint>/ → assert 200 + { service, status: "ok" }
 *   2. POST https://<endpoint>/v1/<first_paid_route> without payment → assert 402
 *      (skipped for free services)
 */

interface SmokeTarget {
  id: string;
  name: string;
  endpoint: string;
  paidRoute: { method: string; path: string } | null;
}

const targets: SmokeTarget[] = [
  {
    "id": "wallet",
    "name": "wallet.sh",
    "endpoint": "wallet.prim.sh",
    "paidRoute": {
      "method": "POST",
      "path": "/v1/wallets"
    }
  },
  {
    "id": "gate",
    "name": "gate.sh",
    "endpoint": "gate.prim.sh",
    "paidRoute": null
  },
  {
    "id": "store",
    "name": "store.sh",
    "endpoint": "store.prim.sh",
    "paidRoute": {
      "method": "POST",
      "path": "/v1/buckets"
    }
  },
  {
    "id": "search",
    "name": "search.sh",
    "endpoint": "search.prim.sh",
    "paidRoute": {
      "method": "POST",
      "path": "/v1/search"
    }
  }
];

let passed = 0;
let failed = 0;

async function check(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  \u2713 ${label}`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  \u2717 ${label}: ${msg}`);
    failed++;
  }
}

for (const t of targets) {
  const base = `https://${t.endpoint}`;
  console.log(`\n${t.name} (${t.endpoint})`);

  // Health check: GET / → 200
  await check(`GET / → 200`, async () => {
    const res = await fetch(base, { redirect: "follow" });
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    if (body.status !== "ok") throw new Error(`expected status "ok", got "${body.status}"`);
    if (body.service !== t.name) {
      throw new Error(`expected service "${t.name}", got "${body.service}"`);
    }
  });

  // 402 check: POST first paid route without payment → 402
  if (t.paidRoute) {
    const routeLabel = `${t.paidRoute.method} ${t.paidRoute.path} → 402`;
    await check(routeLabel, async () => {
      const url = `${base}${t.paidRoute!.path}`;
      const res = await fetch(url, {
        method: t.paidRoute!.method,
        headers: { "Content-Type": "application/json" },
        body: t.paidRoute!.method !== "GET" ? "{}" : undefined,
      });
      if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
    });
  }
}

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
