#!/usr/bin/env bun
/**
 * gen-deploy.ts — Deploy artifact generator
 *
 * Generates deploy artifacts for all deployed primitives from prim.yaml:
 *   1. Caddy fragments → deploy/prim/generated/<id>.caddy
 *   2. Systemd units   → deploy/prim/services/prim-<id>.service
 *   3. Env templates   → deploy/prim/generated/<id>.env.template
 *   4. Assembled Caddyfile → deploy/prim/Caddyfile
 *
 * Usage:
 *   bun scripts/gen-deploy.ts           # regenerate all deploy artifacts
 *   bun scripts/gen-deploy.ts --check   # exit 1 if any artifact is stale
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getDeployConfig, loadPrimitives, withPackage } from "./lib/primitives.js";
import type { Primitive, PrimStatus } from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");
const CHECK_MODE = process.argv.includes("--check");

const GENERATED_DIR = join(ROOT, "deploy/prim/generated");
const SERVICES_DIR = join(ROOT, "deploy/prim/services");
const CADDYFILE_HEADER = join(ROOT, "deploy/prim/Caddyfile.header");
const CADDYFILE_OUT = join(ROOT, "deploy/prim/Caddyfile");

// VPS paths — must match actual deployment
const PRIM_ROOT = "/opt/prim";
const PRIM_ETC = "/etc/prim";
const BUN_PATH = "/home/prim/.bun/bin/bun";

let anyFailed = false;

// ── Helpers ────────────────────────────────────────────────────────────────

function writeIfChanged(filePath: string, content: string, label: string): void {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const changed = existing !== content;
  if (CHECK_MODE) {
    if (changed) {
      console.log(`  ✗ ${label} is out of date`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${label}`);
    }
  } else {
    if (changed) {
      writeFileSync(filePath, content);
      console.log(`  ↺ ${label}`);
    } else {
      console.log(`  ✓ ${label} (unchanged)`);
    }
  }
}

// ── Generators ─────────────────────────────────────────────────────────────

function genSystemdUnit(id: string, name: string, systemdAfter: string[]): string {
  const afterUnits = ["network.target", ...systemdAfter].join(" ");
  return `# THIS FILE IS GENERATED — DO NOT EDIT
# Source: packages/${id}/prim.yaml
# Regenerate: pnpm gen:deploy

[Unit]
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

function genCaddyFragment(prim: Primitive, hasInstallSh: boolean): string {
  const deployConfig = getDeployConfig(prim);
  // biome-ignore lint/style/noNonNullAssertion: only called for deployed prims with validated fields
  const endpoint = prim.endpoint!;
  // biome-ignore lint/style/noNonNullAssertion: only called for deployed prims with validated fields
  const port = prim.port!;

  const lines: string[] = [];
  lines.push(`# THIS FILE IS GENERATED — DO NOT EDIT`);
  lines.push(`# Source: packages/${prim.id}/prim.yaml`);
  lines.push(`# Regenerate: pnpm gen:deploy`);
  lines.push(``);
  lines.push(`${endpoint} {`);
  lines.push("    import security_headers");

  // Access log for mainnet services
  if (prim.deploy?.access_log) {
    lines.push("    log {");
    lines.push(`        output file /var/log/caddy/${prim.id}-access.log`);
    lines.push("        format json");
    lines.push("    }");
  }

  lines.push("    request_body {");
  lines.push(`        max_size ${deployConfig.max_body_size}`);
  lines.push("    }");

  if (hasInstallSh) {
    lines.push("    handle /install.sh {");
    lines.push(`        root * ${PRIM_ROOT}/packages/${prim.id}`);
    lines.push("        file_server");
    lines.push("    }");
    lines.push("    handle {");
    lines.push(`        reverse_proxy localhost:${port}`);
    lines.push("    }");
  } else {
    lines.push("    handle {");
    lines.push(`        reverse_proxy localhost:${port}`);
    lines.push("    }");
  }

  lines.push("}");

  // Extra Caddy blocks (e.g., email's mail.prim.sh)
  const parts = [lines.join("\n"), ...deployConfig.extra_caddy.map((b) => b.trim())];
  return `${parts.join("\n\n")}\n`;
}

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
  FEEDBACK_DB_PATH: "# Path to feedback SQLite database",
  PRIM_FEEDBACK_URL: "# URL for feedback submission endpoint",
};

function genEnvTemplate(id: string, name: string, port: number, envVars: string[]): string {
  const lines: string[] = [
    `# THIS FILE IS GENERATED — DO NOT EDIT`,
    `# Source: packages/${id}/prim.yaml`,
    `# Regenerate: pnpm gen:deploy`,
    ``,
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

// ── Caddyfile assembly ─────────────────────────────────────────────────────

/** Static Caddyfile block for the marketing site (not a primitive) */
const SITE_CADDY_BLOCK = `prim.sh {
    import security_headers
    request_body {
        max_size 1MB
    }
    handle /pricing.json {
        root * ${PRIM_ROOT}/site
        file_server
    }
    handle {
        reverse_proxy localhost:3000
    }
}
`;

function assembleCaddyfile(): void {
  if (!existsSync(CADDYFILE_HEADER)) {
    console.error(`  ✗ Caddyfile.header not found: ${CADDYFILE_HEADER}`);
    process.exit(1);
  }

  const caddyfileHeader = [
    "# THIS FILE IS GENERATED — DO NOT EDIT",
    "# Source: packages/<id>/prim.yaml (all deployed prims) + deploy/prim/Caddyfile.header",
    "# Regenerate: pnpm gen:deploy",
  ].join("\n");

  const header = readFileSync(CADDYFILE_HEADER, "utf-8").trimEnd();

  const fragmentFiles = existsSync(GENERATED_DIR)
    ? readdirSync(GENERATED_DIR)
        .filter((f) => f.endsWith(".caddy"))
        .sort()
    : [];

  const fragments = fragmentFiles.map((f) =>
    readFileSync(join(GENERATED_DIR, f), "utf-8").trimEnd(),
  );

  const assembled = `${[caddyfileHeader, header, ...fragments, SITE_CADDY_BLOCK.trimEnd()].join("\n\n")}\n`;
  writeIfChanged(CADDYFILE_OUT, assembled, "deploy/prim/Caddyfile");
}

// ── Main ───────────────────────────────────────────────────────────────────

/** Prims deployed to VPS */
const DEPLOYABLE_STATUSES: Set<PrimStatus> = new Set(["testnet", "mainnet"]);

/** Prims that get Caddy fragments (have DNS records, actually routable) */
const CADDY_STATUSES: Set<PrimStatus> = new Set(["testnet", "mainnet"]);

const prims = loadPrimitives(ROOT);
const deployable = withPackage(prims, ROOT).filter(
  (p) => DEPLOYABLE_STATUSES.has(p.status) && p.endpoint && p.port,
);

console.log(`Loaded ${prims.length} primitives (${deployable.length} deployed with packages)`);
console.log(`Mode: ${CHECK_MODE ? "check" : "generate"}\n`);

// Ensure output dirs exist
if (!CHECK_MODE) {
  mkdirSync(GENERATED_DIR, { recursive: true });
  mkdirSync(SERVICES_DIR, { recursive: true });
}

for (const prim of deployable) {
  if (!prim.endpoint || !prim.port) {
    console.log(`  – ${prim.id} (missing endpoint or port, skipped)`);
    continue;
  }

  const deployConfig = getDeployConfig(prim);
  const hasInstallSh = existsSync(join(ROOT, `packages/${prim.id}/install.sh`));

  // 1. Caddy fragment — only for live/mainnet (prims with DNS records)
  if (CADDY_STATUSES.has(prim.status)) {
    const caddyContent = genCaddyFragment(prim, hasInstallSh);
    writeIfChanged(
      join(GENERATED_DIR, `${prim.id}.caddy`),
      caddyContent,
      `deploy/prim/generated/${prim.id}.caddy`,
    );
  }

  // 2. Systemd unit
  const unitContent = genSystemdUnit(prim.id, prim.name, deployConfig.systemd_after);
  writeIfChanged(
    join(SERVICES_DIR, `prim-${prim.id}.service`),
    unitContent,
    `deploy/prim/services/prim-${prim.id}.service`,
  );

  // 3. Env template
  const envContent = genEnvTemplate(prim.id, prim.name, prim.port, prim.env ?? []);
  writeIfChanged(
    join(GENERATED_DIR, `${prim.id}.env.template`),
    envContent,
    `deploy/prim/generated/${prim.id}.env.template`,
  );
}

// 4. Assemble Caddyfile
assembleCaddyfile();

if (CHECK_MODE && anyFailed) {
  console.log("\nSome deploy artifacts are out of date. Run `pnpm gen:deploy` to fix.\n");
  process.exit(1);
}

console.log("\nDone.\n");
