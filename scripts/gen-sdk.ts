#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-sdk.ts — Typed SDK client generator
 *
 * Reads packages/<id>/openapi.yaml and generates packages/sdk/src/<id>.ts.
 * Each file exports a typed client factory function.
 *
 * Usage:
 *   bun scripts/gen-sdk.ts           # generate all
 *   bun scripts/gen-sdk.ts --check   # diff against disk, exit 1 if stale
 *   bun scripts/gen-sdk.ts store     # generate only store
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { primsForInterface, specPath } from "./lib/primitives.js";
import { renderSdkClient } from "./lib/render-sdk.js";
import type { OpenApiSpec } from "./lib/render-sdk.js";

const ROOT = resolve(import.meta.dir, "..");
const OUTPUT_DIR = join(ROOT, "packages", "sdk", "src");
const CHECK_MODE = process.argv.includes("--check");

// Optional positional arg: single prim filter
const positionalArg = process.argv.find(
  (a) => !a.startsWith("-") && a !== process.argv[0] && a !== process.argv[1],
);

let anyFailed = false;

// ── File write / check ─────────────────────────────────────────────────────

function applyFile(filePath: string, content: string): void {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  const changed = existing !== content;

  if (CHECK_MODE) {
    if (changed) {
      console.error(`  ✗ ${filePath} is out of date — run pnpm gen:sdk`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${filePath}`);
    }
  } else {
    writeFileSync(filePath, content);
    console.log(`  ${changed ? "↺" : "✓"} ${filePath}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

if (!CHECK_MODE) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const allPrims = primsForInterface("rest");
const prims = positionalArg ? allPrims.filter((p) => p.id === positionalArg) : allPrims;

if (positionalArg && prims.length === 0) {
  console.error(
    `No prim found with id "${positionalArg}" (or missing OpenAPI spec / rest interface)`,
  );
  process.exit(1);
}

console.log(`Processing ${prims.length} prim(s)`);
console.log(CHECK_MODE ? "Mode: check\n" : "Mode: generate\n");

const generatedIds: string[] = [];

for (const prim of prims) {
  const sp = specPath(prim.id);

  if (!existsSync(sp)) {
    console.log(`  – ${prim.id}: no OpenAPI spec (skipped)`);
    continue;
  }

  let spec: OpenApiSpec;
  try {
    spec = parseYaml(readFileSync(sp, "utf8")) as OpenApiSpec;
  } catch (e) {
    console.error(`  ERROR: Failed to parse ${prim.id}.yaml: ${e}`);
    anyFailed = true;
    continue;
  }

  // Must have paths beyond health check
  const paths = Object.keys(spec.paths ?? {}).filter((p) => p !== "/");
  if (paths.length === 0) {
    console.log(`  – ${prim.id}: no API routes (skipped)`);
    continue;
  }

  try {
    const content = renderSdkClient(prim.id, spec);
    const outPath = join(OUTPUT_DIR, `${prim.id}.ts`);
    applyFile(outPath, content);
    generatedIds.push(prim.id);
  } catch (e) {
    console.error(`  ERROR: Failed to render ${prim.id}: ${e}`);
    anyFailed = true;
  }
}

// Generate barrel index — always from all prims on disk, not just filtered ones
if (generatedIds.length > 0) {
  // Collect all prim client files that exist on disk
  const allBarrelIds: string[] = [];
  for (const p of allPrims) {
    if (existsSync(join(OUTPUT_DIR, `${p.id}.ts`))) {
      allBarrelIds.push(p.id);
    }
  }

  // Collect exported names per module
  const exportsByModule = new Map<string, string[]>();
  for (const id of allBarrelIds) {
    const filePath = join(OUTPUT_DIR, `${id}.ts`);
    const content = readFileSync(filePath, "utf8");
    const names: string[] = [];
    for (const match of content.matchAll(/export (?:interface|type|function) (\w+)/g)) {
      names.push(match[1]);
    }
    exportsByModule.set(id, names);
  }

  // Find names that appear in multiple modules
  const nameToModules = new Map<string, string[]>();
  for (const [id, names] of exportsByModule) {
    for (const name of names) {
      if (!nameToModules.has(name)) nameToModules.set(name, []);
      nameToModules.get(name)?.push(id);
    }
  }
  const collisions = new Set<string>();
  for (const [name, modules] of nameToModules) {
    if (modules.length > 1) collisions.add(name);
  }

  const barrelLines: string[] = [
    "// SPDX-License-Identifier: Apache-2.0",
    "// THIS FILE IS GENERATED — DO NOT EDIT",
    "// Source: packages/<id>/openapi.yaml (all prims with rest interface)",
    "// Regenerate: pnpm gen:sdk",
    "",
    'export { unwrap } from "./shared.js";',
  ];

  for (const id of allBarrelIds) {
    // biome-ignore lint/style/noNonNullAssertion: id comes from allBarrelIds which is derived from exportsByModule keys
    const names = exportsByModule.get(id)!;
    const hasCollisions = names.some((n) => collisions.has(n));
    if (!hasCollisions) {
      barrelLines.push(`export * from "./${id}.js";`);
    } else {
      // Use explicit named exports, skipping colliding names (first module wins)
      const exported: string[] = [];
      const skipped: string[] = [];
      for (const name of names) {
        if (collisions.has(name)) {
          // First module to claim the name wins
          const firstModule = nameToModules.get(name)?.[0];
          if (firstModule === id) {
            exported.push(name);
          } else {
            skipped.push(name);
          }
        } else {
          exported.push(name);
        }
      }
      if (exported.length > 0) {
        barrelLines.push(`export { ${exported.join(", ")} } from "./${id}.js";`);
      }
      if (skipped.length > 0) {
        barrelLines.push(`// Skipped from ${id}: ${skipped.join(", ")} (name collision)`);
      }
    }
  }
  barrelLines.push("");

  const barrelPath = join(OUTPUT_DIR, "index.ts");
  applyFile(barrelPath, barrelLines.join("\n"));
}

console.log(`\n  total: ${generatedIds.length} client(s) generated`);

if (CHECK_MODE && anyFailed) {
  console.error("\nSDK clients are out of date. Run: pnpm gen:sdk");
  process.exit(1);
} else if (CHECK_MODE) {
  console.log("\nAll SDK clients are up to date.");
} else {
  console.log("\nDone.");
}
