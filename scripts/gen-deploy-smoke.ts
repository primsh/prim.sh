#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-deploy-smoke.ts — Deploy smoke test generator
 *
 * Reads prim.yaml, filters to mainnet primitives, and emits a Bun script
 * that hits each live endpoint's health route + first paid route (expecting 402).
 *
 * Usage:
 *   bun scripts/gen-deploy-smoke.ts          # regenerate
 *   bun scripts/gen-deploy-smoke.ts --check  # exit 1 if file would change
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrimitives, mainnetDeployed } from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");
const CHECK_MODE = process.argv.includes("--check");
const OUT_PATH = resolve(ROOT, "scripts/deploy-smoke.generated.ts");

// ── Build the generated script ──────────────────────────────────────────────

const prims = mainnetDeployed(loadPrimitives());
console.log(`Found ${prims.length} mainnet primitives`);

interface SmokeTarget {
  id: string;
  name: string;
  endpoint: string;
  /** First paid route for 402 check, null if free_service */
  paidRoute: { method: string; path: string } | null;
}

const targets: SmokeTarget[] = prims.map((p) => {
  const endpoint = p.endpoint ?? `${p.id}.prim.sh`;
  let paidRoute: SmokeTarget["paidRoute"] = null;

  if (!p.factory?.free_service && p.routes_map && p.routes_map.length > 0) {
    const first = p.routes_map[0];
    const [method, path] = first.route.split(" ", 2);
    paidRoute = { method, path };
  }

  return { id: p.id, name: p.name, endpoint, paidRoute };
});

const targetsJson = JSON.stringify(targets, null, 2);

const generated = `#!/usr/bin/env bun
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

const targets: SmokeTarget[] = ${targetsJson};

let passed = 0;
let failed = 0;

async function check(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(\`  \\u2713 \${label}\`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(\`  \\u2717 \${label}: \${msg}\`);
    failed++;
  }
}

for (const t of targets) {
  const base = \`https://\${t.endpoint}\`;
  console.log(\`\\n\${t.name} (\${t.endpoint})\`);

  // Health check: GET / → 200
  await check(\`GET / → 200\`, async () => {
    const res = await fetch(base, { redirect: "follow" });
    if (res.status !== 200) throw new Error(\`expected 200, got \${res.status}\`);
    const body = (await res.json()) as Record<string, unknown>;
    if (body.status !== "ok") throw new Error(\`expected status "ok", got "\${body.status}"\`);
    if (body.service !== t.name) {
      throw new Error(\`expected service "\${t.name}", got "\${body.service}"\`);
    }
  });

  // 402 check: POST first paid route without payment → 402
  if (t.paidRoute) {
    const routeLabel = \`\${t.paidRoute.method} \${t.paidRoute.path} → 402\`;
    await check(routeLabel, async () => {
      const url = \`\${base}\${t.paidRoute!.path}\`;
      const res = await fetch(url, {
        method: t.paidRoute!.method,
        headers: { "Content-Type": "application/json" },
        body: t.paidRoute!.method !== "GET" ? "{}" : undefined,
      });
      if (res.status !== 402) throw new Error(\`expected 402, got \${res.status}\`);
    });
  }
}

console.log(\`\\n--- Results: \${passed} passed, \${failed} failed ---\`);
if (failed > 0) process.exit(1);
`;

// ── Write or check ──────────────────────────────────────────────────────────

if (CHECK_MODE) {
  const existing = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, "utf8") : "";
  if (existing !== generated) {
    console.error(`  \u2717 ${OUT_PATH} is out of date — run pnpm gen:deploy-smoke`);
    process.exit(1);
  }
  console.log(`  \u2713 ${OUT_PATH}`);
} else {
  writeFileSync(OUT_PATH, generated);
  console.log(`  \u21ba ${OUT_PATH}`);
}
