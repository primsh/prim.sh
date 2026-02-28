#!/usr/bin/env bun
/**
 * gate-check.ts — Quality gate CLI
 *
 * Validates a primitive is ready for a status transition.
 *
 * Usage:
 *   bun scripts/gate-check.ts <prim> <target-status>
 *
 * Target statuses:
 *   testing   — local quality gates (building → testing)
 *   live      — confirmed working (testing → live)
 *
 * Exit 0 = pass
 * Exit 1 = fail
 *
 * Alias: pnpm gate <prim> <target-status>
 */

import { type GateTarget, runGateCheck } from "./lib/gate-check.js";
import { loadPrimitives } from "./lib/primitives.js";

const VALID_TARGETS: GateTarget[] = ["testing", "live"];

async function main() {
  const primId = process.argv[2];
  const target = process.argv[3] as GateTarget | undefined;

  const prims = loadPrimitives();
  const primIds = prims.map((p) => p.id);

  if (!primId || !primIds.includes(primId)) {
    console.error("\nUsage: bun scripts/gate-check.ts <prim> <target-status>");
    console.error(`\nKnown primitives: ${primIds.join(", ")}`);
    console.error(`Target statuses:  ${VALID_TARGETS.join(", ")}\n`);
    process.exit(1);
  }

  if (!target || !VALID_TARGETS.includes(target)) {
    console.error("\nUsage: bun scripts/gate-check.ts <prim> <target-status>");
    console.error(`\nTarget statuses: ${VALID_TARGETS.join(", ")}\n`);
    process.exit(1);
  }

  console.log(`\n=== Gate Check: ${primId} → ${target} ===\n`);

  const result = await runGateCheck(primId, target);

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const w of result.warnings) {
      console.log(`  ⚠  ${w}`);
    }
    console.log();
  }

  if (result.failures.length > 0) {
    console.log("Failures:");
    for (const f of result.failures) {
      console.log(`  ✗ ${f}`);
    }
    console.log(
      `\n✗ Gate FAILED — ${result.failures.length} check(s) blocked transition to ${target}\n`,
    );
    process.exit(1);
  }

  console.log(`✓ Gate PASSED — ${primId} is ready for status: ${target}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
