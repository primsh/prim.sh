#!/usr/bin/env bun
/**
 * deploy-prim.ts — Deploy artifact generator
 *
 * Generates all deploy artifacts for a primitive from its prim.yaml:
 *   1. Systemd unit  → deploy/prim/services/prim-<id>.service
 *   2. Caddy fragment → deploy/prim/generated/<id>.caddy
 *   3. Env template  → deploy/prim/generated/<id>.env.template
 *   4. Assembled Caddyfile → deploy/prim/Caddyfile
 *
 * Usage:
 *   bun scripts/deploy-prim.ts <name>          # generate artifacts
 *   bun scripts/deploy-prim.ts <name> --check  # dry-run diff only
 *   bun scripts/deploy-prim.ts --assemble       # reassemble Caddyfile only
 *
 * Alias: pnpm deploy:prim <name>
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadPrimitives, getDeployConfig } from "./lib/primitives.js";
import { runGateCheck } from "./lib/gate-check.js";

const ROOT = resolve(import.meta.dir, "..");
const CHECK_MODE = process.argv.includes("--check");
const ASSEMBLE_ONLY = process.argv.includes("--assemble");
const SKIP_GATE = process.argv.includes("--skip-gate");

// Configurable paths — override via env vars for non-standard deployments
const PRIM_ROOT = process.env.PRIM_ROOT ?? "/opt/prim";
const PRIM_ETC = process.env.PRIM_ETC ?? "/etc/prim";
// BUN_PATH: default to `which bun` at runtime; override via env var for non-standard installs
import { execSync } from "node:child_process";
const BUN_PATH = process.env.BUN_PATH ?? (() => {
  try { return execSync("which bun", { encoding: "utf-8" }).trim(); }
  catch { return "/usr/local/bin/bun"; }
})();

// ── Helpers ────────────────────────────────────────────────────────────────

function writeIfChanged(filePath: string, content: string, label: string): boolean {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const changed = existing !== content;
  if (CHECK_MODE) {
    if (changed) console.log(`  ✗ ${label} is out of date`);
    else console.log(`  ✓ ${label}`);
  } else {
    if (changed) {
      writeFileSync(filePath, content);
      console.log(`  ↺ ${label}`);
    } else {
      console.log(`  ✓ ${label} (unchanged)`);
    }
  }
  return changed;
}

// ── Caddyfile assembly ─────────────────────────────────────────────────────

function assembleCaddyfile(): void {
  const headerPath = join(ROOT, "deploy/prim/Caddyfile.header");
  const generatedDir = join(ROOT, "deploy/prim/generated");
  const outPath = join(ROOT, "deploy/prim/Caddyfile");

  if (!existsSync(headerPath)) {
    console.error(`  ✗ Caddyfile.header not found: ${headerPath}`);
    process.exit(1);
  }

  const header = readFileSync(headerPath, "utf-8").trimEnd();

  const fragmentFiles = existsSync(generatedDir)
    ? readdirSync(generatedDir)
        .filter((f) => f.endsWith(".caddy"))
        .sort()
    : [];

  const fragments = fragmentFiles.map((f) =>
    readFileSync(join(generatedDir, f), "utf-8").trimEnd(),
  );

  const assembled = [header, ...fragments].join("\n\n") + "\n";
  writeIfChanged(outPath, assembled, "deploy/prim/Caddyfile");
}

// ── Systemd unit generator ─────────────────────────────────────────────────

function genSystemdUnit(id: string, name: string, systemdAfter: string[]): string {
  const afterUnits = ["network.target", ...systemdAfter].join(" ");
  return `[Unit]
Description=prim.sh ${name} service
After=${afterUnits}

[Service]
Type=simple
User=prim
WorkingDirectory=${PRIM_ROOT}
EnvironmentFile=${PRIM_ETC}/${id}.env
ExecStart=${BUN_PATH} run packages/${id}/src/index.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}

// ── Caddy fragment generator ───────────────────────────────────────────────

function genCaddyFragment(port: number, endpoint: string, maxBodySize: string, extraCaddy: string[]): string {
  const main = `${endpoint} {
    import security_headers
    request_body {
        max_size ${maxBodySize}
    }
    reverse_proxy localhost:${port}
}`;

  // Replace placeholder — actual port injected below
  const parts = [main, ...extraCaddy.map((b) => b.trim())];
  return parts.join("\n\n") + "\n";
}

// ── Env template generator ─────────────────────────────────────────────────

const ENV_COMMENTS: Record<string, string> = {
  PRIM_PAY_TO: "# x402 payment recipient address (your treasury wallet)",
  PRIM_NETWORK: "# Chain: eip155:8453 (Base mainnet) or eip155:84532 (Base Sepolia)",
  PRIM_INTERNAL_KEY: "# Shared secret for internal API calls between services",
  CIRCLE_API_KEY: "# Circle API key for Base Sepolia USDC drips",
  FAUCET_TREASURY_KEY: "# Treasury wallet private key (hex, no 0x prefix) for ETH drips",
  DO_API_TOKEN: "# DigitalOcean API token",
  WALLET_INTERNAL_URL: "# URL of the wallet service internal API",
  CLOUDFLARE_ACCOUNT_ID: "# Cloudflare account ID",
  CLOUDFLARE_API_TOKEN: "# Cloudflare API token with DNS edit permissions",
  R2_ACCESS_KEY_ID: "# Cloudflare R2 access key ID",
  R2_SECRET_ACCESS_KEY: "# Cloudflare R2 secret access key",
  STALWART_URL: "# Stalwart mail server URL (e.g. http://localhost:8080)",
  STALWART_API_KEY: "# Stalwart API credentials (base64 user:pass)",
  EMAIL_DEFAULT_DOMAIN: "# Default email domain (e.g. email.prim.sh)",
  TAVILY_API_KEY: "# Tavily search API key (https://tavily.com)",
  TOKEN_MASTER_KEY: "# Master encryption key for deployer keystore",
  TOKEN_DEPLOYER_ENCRYPTED_KEY: "# AES-256-GCM encrypted deployer private key",
  BASE_RPC_URL: "# Base RPC URL (e.g. https://mainnet.base.org)",
  QDRANT_URL: "# Qdrant vector DB URL (e.g. http://localhost:6333)",
  GOOGLE_API_KEY: "# Google API key for embedding model",
  CLOUDFLARE_ZONE_ID: "# Cloudflare zone ID for DNS management",
  NAMESILO_API_KEY: "# Namesilo API key for domain registration",
  TRACKINGMORE_API_KEY: "# TrackingMore API key (https://www.trackingmore.com)",
};

function genEnvTemplate(id: string, name: string, port: number, envVars: string[]): string {
  const lines: string[] = [
    `# Required env vars for prim-${id}.service`,
    `# Docs: packages/${id}/src/index.ts`,
    "",
    `PORT=${port}`,
    "",
  ];

  for (const key of envVars) {
    const comment = ENV_COMMENTS[key];
    if (comment) lines.push(comment);
    lines.push(`${key}=`);
    lines.push("");
  }

  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // --assemble: just reassemble the Caddyfile
  if (ASSEMBLE_ONLY) {
    console.log("\n=== Assembling Caddyfile ===\n");
    assembleCaddyfile();
    console.log("\nDone.\n");
    return;
  }

  const primId = process.argv[2];
  const prims = loadPrimitives();
  const primIds = prims.map((p) => p.id);

  if (!primId || primId.startsWith("--") || !primIds.includes(primId)) {
    console.error("\nUsage: bun scripts/deploy-prim.ts <name> [--check] [--skip-gate]");
    console.error("       bun scripts/deploy-prim.ts --assemble");
    console.error(`\nKnown primitives: ${primIds.join(", ")}\n`);
    process.exit(1);
  }

  const prim = prims.find((p) => p.id === primId)!;

  // Validate required fields
  const required = ["id", "name", "endpoint", "port"] as const;
  for (const field of required) {
    if (!prim[field]) {
      console.error(`\n✗ prim.yaml missing required field: ${field}\n`);
      process.exit(1);
    }
  }

  console.log(`\n=== Deploy Artifacts: ${primId} ===\n`);

  // Gate check (testing → live)
  if (!SKIP_GATE && !CHECK_MODE) {
    console.log("Running gate check (testing → live)...");
    const gate = await runGateCheck(primId, "live");
    if (!gate.pass) {
      console.log("\nGate FAILED:");
      for (const f of gate.failures) console.log(`  ✗ ${f}`);
      console.log(`\nFix the above issues or re-run with --skip-gate\n`);
      process.exit(1);
    }
    if (gate.warnings.length > 0) {
      for (const w of gate.warnings) console.log(`  ⚠  ${w}`);
    }
    console.log("  ✓ gate passed\n");
  }

  const deployConfig = getDeployConfig(prim);
  const endpoint = prim.endpoint!;
  const port = prim.port!;
  const name = prim.name;

  // 1. Systemd unit
  const unitContent = genSystemdUnit(primId, name, deployConfig.systemd_after);
  writeIfChanged(
    join(ROOT, `deploy/prim/services/prim-${primId}.service`),
    unitContent,
    `deploy/prim/services/prim-${primId}.service`,
  );

  // 2. Caddy fragment
  const caddyContent = genCaddyFragment(
    port,
    endpoint,
    deployConfig.max_body_size,
    deployConfig.extra_caddy,
  );
  writeIfChanged(
    join(ROOT, `deploy/prim/generated/${primId}.caddy`),
    caddyContent,
    `deploy/prim/generated/${primId}.caddy`,
  );

  // 3. Env template
  const envContent = genEnvTemplate(primId, name, port, prim.env ?? []);
  writeIfChanged(
    join(ROOT, `deploy/prim/generated/${primId}.env.template`),
    envContent,
    `deploy/prim/generated/${primId}.env.template`,
  );

  // 4. Assemble Caddyfile
  assembleCaddyfile();

  if (!CHECK_MODE) {
    console.log(`
Next steps (run on VPS):
  1. git -C ${PRIM_ROOT} pull --ff-only
  2. cp deploy/prim/services/prim-${primId}.service /etc/systemd/system/
  3. systemctl daemon-reload
  4. cp deploy/prim/generated/${primId}.env.template ${PRIM_ETC}/${primId}.env
     # Then fill in real values: vim ${PRIM_ETC}/${primId}.env
  5. cp deploy/prim/Caddyfile /etc/caddy/Caddyfile && caddy reload --config /etc/caddy/Caddyfile
  6. systemctl enable --now prim-${primId}
  7. bun scripts/gate-check.ts ${primId} live
`);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
