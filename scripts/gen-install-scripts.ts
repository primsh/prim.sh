#!/usr/bin/env bun
/**
 * gen-install-scripts.ts — Generate per-primitive install.sh files
 *
 * Reads site/install.sh as the base template, discovers all non-`soon`
 * primitives from packages/<id>/prim.yaml, and writes a customized
 * install.sh to packages/<id>/install.sh.
 *
 * Usage: bun scripts/gen-install-scripts.ts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dir, "..");

interface PrimYaml {
  id: string;
  name: string;
  endpoint: string;
  status: string;
}

function loadYaml(p: string): PrimYaml | null {
  try {
    return parse(readFileSync(p, "utf-8")) as PrimYaml;
  } catch {
    return null;
  }
}

const BASE = readFileSync(join(ROOT, "site/install.sh"), "utf-8");
const pkgDir = join(ROOT, "packages");

const dirs = readdirSync(pkgDir).filter((d) =>
  existsSync(join(pkgDir, d, "prim.yaml"))
);

let written = 0;

for (const id of dirs) {
  const cfg = loadYaml(join(pkgDir, id, "prim.yaml"));
  if (!cfg || cfg.status === "soon") continue;

  const { name, endpoint } = cfg;

  // 1. Replace header comment block
  let script = BASE.replace(
    "# Install script for the prim CLI\n# Usage: curl -fsSL prim.sh/install | sh",
    `# Install ${name} — prim.sh\n# Usage: curl -fsSL https://${endpoint}/install.sh | sh`
  );

  // 2. Insert `prim install <id>` after `chmod +x "$BIN"`, before PATH_LINE block
  script = script.replace(
    'chmod +x "$BIN"',
    `chmod +x "$BIN"\n\n# Install ${name} skills\n"$BIN" install ${id}`
  );

  // 3. Replace the closing "Then try:" block with primitive-specific message
  script = script.replace(
    /echo "Then try:"\necho ".*"(\n)?$/,
    `echo "  ${name} installed. Your agent can now use ${id} tools."\n`
  );

  const outPath = join(pkgDir, id, "install.sh");
  writeFileSync(outPath, script, { mode: 0o755 });
  console.log(`  ✓ ${outPath}`);
  written++;
}

console.log(`\nDone. Wrote ${written} install scripts.`);
