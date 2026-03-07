#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-deploy.ts — Deploy artifact generator
 *
 * Generates deploy artifacts from two sources:
 *   - prim.yaml (per-package, for primitives)
 *   - prim-apps.yaml (repo root, for consumer apps)
 *
 * Output:
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
import { parse as parseYaml } from "yaml";
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

// ── Types ─────────────────────────────────────────────────────────────────

interface AppConfig {
  name: string;
  endpoint: string;
  port: number;
  entry: string;
  max_body_size?: string;
  csp?: string;
  env: string[];
}

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

// ── Generators (primitives) ───────────────────────────────────────────────

function genSystemdUnit(
  id: string,
  name: string,
  execStart: string,
  source: string,
  systemdAfter: string[],
): string {
  const afterUnits = ["network.target", ...systemdAfter].join(" ");
  return `# THIS FILE IS GENERATED — DO NOT EDIT
# Source: ${source}
# Regenerate: pnpm gen:deploy

[Unit]
Description=prim.sh ${name} service
After=${afterUnits}

[Service]
Type=simple
User=prim
WorkingDirectory=${PRIM_ROOT}
EnvironmentFile=${PRIM_ETC}/${id}.env
ExecStart=${execStart}
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

function genAppCaddyFragment(id: string, app: AppConfig): string {
  const lines: string[] = [];
  lines.push(`# THIS FILE IS GENERATED — DO NOT EDIT`);
  lines.push(`# Source: prim-apps.yaml (app: ${id})`);
  lines.push(`# Regenerate: pnpm gen:deploy`);
  lines.push(``);
  lines.push(`${app.endpoint} {`);
  lines.push("    import security_headers");
  if (app.csp) {
    lines.push("    header Content-Security-Policy \"" + app.csp + "\"");
  }
  lines.push("    request_body {");
  lines.push(`        max_size ${app.max_body_size ?? "1MB"}`);
  lines.push("    }");
  lines.push("    handle {");
  lines.push(`        reverse_proxy localhost:${app.port}`);
  lines.push("    }");
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

const ENV_COMMENTS: Record<string, string> = {
  REVENUE_WALLET: "# x402 payment recipient address",
  PRIM_NETWORK: "# Chain: eip155:8453 (Base mainnet) or eip155:84532 (Base Sepolia)",
  PRIM_INTERNAL_KEY: "# Shared secret for internal API calls between services",
  TESTNET_WALLET: "# Treasury wallet private key (hex, no 0x prefix) for faucet drips",
  FAUCET_RESERVE_USDC: "# Reserve floor — refuse treasury fallback below this USDC amount (default: 10.00)",
  FAUCET_RESERVE_ETH: "# Reserve floor — refuse treasury fallback below this ETH amount (default: 0.005)",
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
  CHAT_ENCRYPTION_KEY: "# AES-256-GCM key for encrypting custodial wallet private keys (64 hex chars)",
  CHAT_SESSION_SECRET: "# HMAC secret for signing session cookies",
  CHAT_DB_PATH: "# Path to chat SQLite database (e.g. /opt/prim/data/chat.db)",
  INFER_BASE_URL: "# Base URL for infer.sh (e.g. https://infer.prim.sh)",
  PRIM_BASE_URL: "# Base URL template for prim services (e.g. https://{service}.prim.sh)",
};

function genEnvTemplate(
  id: string,
  source: string,
  port: number,
  envVars: string[],
  docsPath?: string,
): string {
  const lines: string[] = [
    `# THIS FILE IS GENERATED — DO NOT EDIT`,
    `# Source: ${source}`,
    `# Regenerate: pnpm gen:deploy`,
    ``,
    `# Required env vars for prim-${id}.service`,
    ...(docsPath ? [`# Docs: ${docsPath}`] : []),
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

// ── Load apps from prim-apps.yaml ─────────────────────────────────────────

function loadApps(): Map<string, AppConfig> {
  const appsFile = join(ROOT, "prim-apps.yaml");
  if (!existsSync(appsFile)) return new Map();

  const raw = readFileSync(appsFile, "utf-8");
  const parsed = parseYaml(raw) as { apps?: Record<string, AppConfig> };
  if (!parsed?.apps) return new Map();

  return new Map(Object.entries(parsed.apps));
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
    "# Source: packages/<id>/prim.yaml + prim-apps.yaml + deploy/prim/Caddyfile.header",
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
const apps = loadApps();

console.log(
  `Loaded ${prims.length} primitives (${deployable.length} deployed with packages)` +
    (apps.size > 0 ? `, ${apps.size} app(s)` : ""),
);
console.log(`Mode: ${CHECK_MODE ? "check" : "generate"}\n`);

// Ensure output dirs exist
if (!CHECK_MODE) {
  mkdirSync(GENERATED_DIR, { recursive: true });
  mkdirSync(SERVICES_DIR, { recursive: true });
}

// Collect all service IDs for the SERVICES array in deploy.sh
const allServiceIds: string[] = [];

// ── Process primitives ────────────────────────────────────────────────────

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

  // 2. Systemd unit — keep original source line for backward compat
  const primUnitContent = genSystemdUnit(
    prim.id,
    prim.name,
    `${BUN_PATH} run packages/${prim.id}/src/index.ts`,
    `packages/${prim.id}/prim.yaml`,
    deployConfig.systemd_after,
  );
  writeIfChanged(
    join(SERVICES_DIR, `prim-${prim.id}.service`),
    primUnitContent,
    `deploy/prim/services/prim-${prim.id}.service`,
  );

  // 3. Env template
  const envContent = genEnvTemplate(
    prim.id,
    `packages/${prim.id}/prim.yaml`,
    prim.port,
    prim.env ?? [],
    `packages/${prim.id}/src/index.ts`,
  );
  writeIfChanged(
    join(GENERATED_DIR, `${prim.id}.env.template`),
    envContent,
    `deploy/prim/generated/${prim.id}.env.template`,
  );

  allServiceIds.push(prim.id);
}

// ── Process apps ──────────────────────────────────────────────────────────

if (apps.size > 0) {
  console.log("");
  for (const [id, app] of apps) {
    // 1. Caddy fragment
    const caddyContent = genAppCaddyFragment(id, app);
    writeIfChanged(
      join(GENERATED_DIR, `${id}.caddy`),
      caddyContent,
      `deploy/prim/generated/${id}.caddy`,
    );

    // 2. Systemd unit
    const unitContent = genSystemdUnit(
      id,
      app.name,
      `${BUN_PATH} run ${app.entry}`,
      `prim-apps.yaml (app: ${id})`,
      [],
    );
    writeIfChanged(
      join(SERVICES_DIR, `prim-${id}.service`),
      unitContent,
      `deploy/prim/services/prim-${id}.service`,
    );

    // 3. Env template
    const envContent = genEnvTemplate(
      id,
      `prim-apps.yaml (app: ${id})`,
      app.port,
      app.env,
    );
    writeIfChanged(
      join(GENERATED_DIR, `${id}.env.template`),
      envContent,
      `deploy/prim/generated/${id}.env.template`,
    );

    allServiceIds.push(id);
  }
}

// ── Update SERVICES array in deploy.sh ────────────────────────────────────

const deployShPath = join(ROOT, "deploy/prim/deploy.sh");
if (existsSync(deployShPath)) {
  const deployShContent = readFileSync(deployShPath, "utf-8");
  const servicesLine = `SERVICES=(${allServiceIds.join(" ")})`;
  const updated = deployShContent.replace(
    /# BEGIN:PRIM:SERVICES\n.*\n# END:PRIM:SERVICES/,
    `# BEGIN:PRIM:SERVICES\n${servicesLine}\n# END:PRIM:SERVICES`,
  );
  writeIfChanged(deployShPath, updated, "deploy/prim/deploy.sh [SERVICES]");
}

// ── Assemble Caddyfile ────────────────────────────────────────────────────

assembleCaddyfile();

if (CHECK_MODE && anyFailed) {
  console.log("\nSome deploy artifacts are out of date. Run `pnpm gen:deploy` to fix.\n");
  process.exit(1);
}

console.log("\nDone.\n");
