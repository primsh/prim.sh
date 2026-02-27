/**
 * scripts/lib/gate-check.ts — Quality gate logic
 *
 * Validates a primitive is ready for a status transition:
 *   building → testing  (local quality gates)
 *   testing  → deployed (infra ready)
 *   deployed → live     (confirmed working)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolve4 } from "node:dns/promises";
import { loadPrimitives, getGateOverrides } from "./primitives.js";

export type GateTarget = "testing" | "deployed" | "live";

export interface GateResult {
  pass: boolean;
  failures: string[];
  warnings: string[];
}

const VPS_IP = process.env.VPS_IP ?? "<VPS_IP>";

function grep(dir: string, pattern: string): boolean {
  try {
    execSync(`grep -r --include="*.ts" -l "${pattern}" "${dir}"`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── building → testing ─────────────────────────────────────────────────────

async function checkBuildingToTesting(
  primId: string,
  root: string,
  failures: string[],
  warnings: string[],
): Promise<void> {
  const pkgDir = join(root, "packages", primId);
  const srcDir = join(pkgDir, "src");
  const entry = join(srcDir, "index.ts");

  // 1. Package exists
  if (!existsSync(entry)) {
    failures.push(`packages/${primId}/src/index.ts not found`);
    return; // No point continuing
  }

  // 2. pnpm check (lint + typecheck + unit tests)
  try {
    execSync(`pnpm --filter @primsh/${primId} check 2>&1`, {
      cwd: root,
      timeout: 120_000,
      encoding: "utf-8",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`pnpm check failed: ${msg.slice(0, 200)}`);
  }

  // 3. Smoke test (if test:smoke script exists)
  const prims = loadPrimitives(root);
  const prim = prims.find((p) => p.id === primId);
  const pkgJson = join(pkgDir, "package.json");
  let hasSmokeScript = false;
  if (existsSync(pkgJson)) {
    const pkg = JSON.parse(readFileSync(pkgJson, "utf-8")) as { scripts?: Record<string, string> };
    hasSmokeScript = Boolean(pkg.scripts?.["test:smoke"]);
  }

  const gateConfig = prim ? getGateOverrides(prim) : { coverage_threshold: 80, allow_todo: false, skip_smoke: false, approved_by: "" };

  if (hasSmokeScript && !gateConfig.skip_smoke) {
    try {
      execSync(`pnpm --filter @primsh/${primId} test:smoke 2>&1`, {
        cwd: root,
        timeout: 60_000,
        encoding: "utf-8",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`test:smoke failed: ${msg.slice(0, 200)}`);
    }
  }

  // 4. Coverage (best-effort — warn if not configured, fail if below threshold)
  try {
    const output = execSync(
      `pnpm --filter @primsh/${primId} test -- --coverage --reporter=json 2>&1`,
      { cwd: root, timeout: 120_000, encoding: "utf-8" },
    );
    const coverageFile = join(pkgDir, "coverage/coverage-summary.json");
    if (existsSync(coverageFile)) {
      const summary = JSON.parse(readFileSync(coverageFile, "utf-8")) as {
        total?: { lines?: { pct?: number } };
      };
      const pct = summary.total?.lines?.pct ?? 0;
      const threshold = gateConfig.coverage_threshold;
      if (pct < threshold) {
        failures.push(`coverage ${pct.toFixed(1)}% < threshold ${threshold}%`);
      }
    } else {
      // Coverage ran but no summary file — likely not configured
      void output;
      warnings.push("coverage summary not found — add @vitest/coverage-v8 config");
    }
  } catch {
    warnings.push("coverage check skipped — install @vitest/coverage-v8 to enable");
  }

  // 5. No TODO/FIXME
  if (!gateConfig.allow_todo && existsSync(srcDir)) {
    if (grep(srcDir, "TODO\\|FIXME")) {
      failures.push(`TODO/FIXME found in packages/${primId}/src/ (set gates.allow_todo: true to override)`);
    }
  }

  // 6. prim.yaml required fields
  const yamlPath = join(pkgDir, "prim.yaml");
  if (!existsSync(yamlPath)) {
    failures.push(`packages/${primId}/prim.yaml not found`);
  } else if (prim) {
    const required = ["id", "name", "endpoint", "port", "env", "pricing"] as const;
    for (const field of required) {
      if (!prim[field]) {
        failures.push(`prim.yaml missing required field: ${field}`);
      }
    }
  }
}

// ── testing → deployed ─────────────────────────────────────────────────────

async function checkTestingToDeployed(
  primId: string,
  root: string,
  failures: string[],
  warnings: string[],
): Promise<void> {
  // All building→testing gates first
  await checkBuildingToTesting(primId, root, failures, warnings);

  const prims = loadPrimitives(root);
  const prim = prims.find((p) => p.id === primId);

  // 2. systemd unit exists
  const unitFile = join(root, `deploy/prim/services/prim-${primId}.service`);
  if (!existsSync(unitFile)) {
    failures.push(`systemd unit not found: deploy/prim/services/prim-${primId}.service`);
  }

  // 3. Caddy block exists (check generated fragment or assembled Caddyfile)
  const endpoint = prim?.endpoint ?? `${primId}.prim.sh`;
  const fragment = join(root, `deploy/prim/generated/${primId}.caddy`);
  const caddyfile = join(root, "deploy/prim/Caddyfile");
  const fragmentOk = existsSync(fragment) &&
    readFileSync(fragment, "utf-8").includes(endpoint);
  const caddyfileOk = existsSync(caddyfile) &&
    readFileSync(caddyfile, "utf-8").includes(endpoint);
  if (!fragmentOk && !caddyfileOk) {
    failures.push(`no Caddy block found for ${endpoint}`);
  }

  // 4. DNS resolves to VPS
  try {
    const addrs = await resolve4(endpoint);
    if (!addrs.includes(VPS_IP)) {
      warnings.push(`${endpoint} resolves to ${addrs.join(", ")} (expected ${VPS_IP})`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`DNS not yet set for ${endpoint}: ${msg.slice(0, 60)}`);
  }

  // 5. External deps reachable
  await checkExternalDeps(primId, failures);

  // 6. Env vars from prim.yaml set
  if (prim?.env) {
    for (const key of prim.env) {
      if (!process.env[key]) {
        failures.push(`env var not set: ${key}`);
      }
    }
  }

  void deployConfig;
}

// ── deployed → live ────────────────────────────────────────────────────────

async function checkDeployedToLive(
  primId: string,
  root: string,
  failures: string[],
  warnings: string[],
): Promise<void> {
  const prims = loadPrimitives(root);
  const prim = prims.find((p) => p.id === primId);
  const endpoint = prim?.endpoint ?? `${primId}.prim.sh`;

  // 1. Health check
  try {
    const res = await fetch(`https://${endpoint}/`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      failures.push(`GET https://${endpoint}/ returned HTTP ${res.status}`);
    } else {
      const data = (await res.json()) as { status?: string };
      if (data.status !== "ok") {
        failures.push(`GET https://${endpoint}/ missing { status: "ok" } in response`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`GET https://${endpoint}/ unreachable: ${msg.slice(0, 80)}`);
  }

  // 2. x402 middleware active — first paid route returns 402
  const pricing = prim?.pricing;
  if (pricing && pricing.length > 0) {
    // Derive a likely paid endpoint from the first pricing entry op name
    const testPath = `/v1/${primId}`;
    try {
      const res = await fetch(`https://${endpoint}${testPath}`, {
        method: "POST",
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status !== 402) {
        warnings.push(`POST ${testPath} returned ${res.status} (expected 402 — is x402 middleware active?)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`x402 check skipped: ${msg.slice(0, 60)}`);
    }
  }

  // 3. Manual sign-off
  if (prim) {
    const gates = getGateOverrides(prim);
    if (!gates.approved_by) {
      failures.push(`manual sign-off required — set gates.approved_by in packages/${primId}/prim.yaml`);
    }
  }

}

// ── External deps (shared) ─────────────────────────────────────────────────

async function checkExternalDeps(primId: string, failures: string[]): Promise<void> {
  if (primId === "mem") {
    const qdrantUrl = process.env.QDRANT_URL;
    if (!qdrantUrl) {
      failures.push("QDRANT_URL not set — cannot check Qdrant reachability");
      return;
    }
    try {
      const res = await fetch(`${qdrantUrl.replace(/\/$/, "")}/healthz`, {
        signal: AbortSignal.timeout(5_000),
      }).catch(() => fetch(`${qdrantUrl.replace(/\/$/, "")}/`, { signal: AbortSignal.timeout(5_000) }));
      if (!res.ok) failures.push(`Qdrant ${qdrantUrl} returned HTTP ${res.status}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`Qdrant unreachable: ${msg.slice(0, 80)}`);
    }
  }

  if (primId === "email") {
    const stalwartUrl = process.env.STALWART_URL;
    if (!stalwartUrl) {
      failures.push("STALWART_URL not set — cannot check Stalwart reachability");
      return;
    }
    try {
      const res = await fetch(`${stalwartUrl.replace(/\/$/, "")}/`, { signal: AbortSignal.timeout(5_000) });
      if (![200, 401, 404].includes(res.status)) {
        failures.push(`Stalwart ${stalwartUrl} returned HTTP ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`Stalwart unreachable: ${msg.slice(0, 80)}`);
    }
  }

  if (primId === "token") {
    const rpcUrl = process.env.BASE_RPC_URL;
    if (!rpcUrl) {
      failures.push("BASE_RPC_URL not set — cannot check Base RPC reachability");
      return;
    }
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        failures.push(`Base RPC ${rpcUrl} returned HTTP ${res.status}`);
      } else {
        const data = (await res.json()) as { result?: string; error?: { message: string } };
        if (data.error) failures.push(`Base RPC error: ${data.error.message}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`Base RPC unreachable: ${msg.slice(0, 80)}`);
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function runGateCheck(
  primId: string,
  targetStatus: GateTarget,
  root?: string,
): Promise<GateResult> {
  const rootDir = root ?? resolve(new URL("../..", import.meta.url).pathname);
  const failures: string[] = [];
  const warnings: string[] = [];

  switch (targetStatus) {
    case "testing":
      await checkBuildingToTesting(primId, rootDir, failures, warnings);
      break;
    case "deployed":
      await checkTestingToDeployed(primId, rootDir, failures, warnings);
      break;
    case "live":
      await checkDeployedToLive(primId, rootDir, failures, warnings);
      break;
  }

  return { pass: failures.length === 0, failures, warnings };
}
