#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * conformance.ts — Static conformance checker for live prims
 *
 * Verifies that every live prim passes the 5-check smoke test contract
 * without executing tests. Static analysis only (regex pattern matching).
 *
 * Usage:
 *   bun scripts/conformance.ts
 *   pnpm test:conformance
 *
 * Exit 0 = all checks pass
 * Exit 1 = one or more checks fail (details printed per prim)
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { deployed, loadPrimitives } from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");

// ── Types ──────────────────────────────────────────────────────────────────

interface CheckResult {
  pass: boolean;
  message: string;
}

interface PrimReport {
  id: string;
  checks: { label: string; result: CheckResult }[];
}

// ── Check helpers ──────────────────────────────────────────────────────────

function checkFileExists(path: string): CheckResult {
  if (existsSync(path)) {
    return { pass: true, message: "exists" };
  }
  return { pass: false, message: `file not found: ${path.replace(`${ROOT}/`, "")}` };
}

function checkPattern(
  content: string,
  pattern: RegExp | string,
  label: string,
  file = "smoke.test.ts",
): CheckResult {
  const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
  if (re.test(content)) {
    return { pass: true, message: `pattern found: ${label}` };
  }
  return { pass: false, message: `pattern missing in ${file}: ${label}` };
}

function checkYamlFields(content: string, fields: string[]): CheckResult {
  const missing: string[] = [];
  for (const field of fields) {
    // Match top-level YAML key (field: ...) — must appear at start of line
    const re = new RegExp(`^${field}:`, "m");
    if (!re.test(content)) {
      missing.push(field);
    }
  }
  if (missing.length === 0) {
    return { pass: true, message: "all required fields present" };
  }
  return { pass: false, message: `prim.yaml missing required fields: ${missing.join(", ")}` };
}

// ── Per-prim checks ────────────────────────────────────────────────────────

const REQUIRED_YAML_FIELDS = ["id", "name", "port", "routes_map", "pricing", "env"];

function runChecks(
  primId: string,
  isFreeService: boolean,
): { label: string; result: CheckResult }[] {
  const pkgDir = join(ROOT, "packages", primId);
  const smokeTestPath = join(pkgDir, "test", "smoke.test.ts");
  const primYamlPath = join(pkgDir, "prim.yaml");
  const indexTsPath = join(pkgDir, "src", "index.ts");

  const results: { label: string; result: CheckResult }[] = [];

  // Check 1: smoke.test.ts exists
  const smokeExists = checkFileExists(smokeTestPath);
  results.push({ label: "Check 1: smoke.test.ts exists", result: smokeExists });

  // Checks 2–5 require the file to exist
  if (smokeExists.pass) {
    const smokeContent = readFileSync(smokeTestPath, "utf8");

    // Check 2: health check assertion (service + status: "ok")
    const check2 = checkPattern(
      smokeContent,
      /service.*status.*ok|status.*ok.*service|\{ service:|toMatchObject\(\{.*service/s,
      `GET / → { service: "...", status: "ok" } assertion`,
    );
    results.push({ label: "Check 2: GET / health assertion", result: check2 });

    // Check 3: createAgentStackMiddleware spy (skip for free services)
    if (isFreeService) {
      results.push({
        label: "Check 3: middleware spy (skipped — freeService)",
        result: { pass: true, message: "skipped: freeService prim" },
      });
    } else {
      const check3 = checkPattern(
        smokeContent,
        /createAgentStackMiddleware/,
        "createAgentStackMiddleware spy",
      );
      results.push({ label: "Check 3: createAgentStackMiddleware spy", result: check3 });
    }

    // Check 4: happy-path 200 assertion
    const check4 = checkPattern(
      smokeContent,
      /\.toBe\(200\)|\.toBe\(201\)|status.*200|status.*201/,
      "happy-path 2xx response assertion",
    );
    results.push({ label: "Check 4: happy-path 2xx assertion", result: check4 });

    // Check 5: error-path 400 assertion
    const check5 = checkPattern(
      smokeContent,
      /\.toBe\(400\)|status.*400|toBe\(400\)/,
      "error-path 400 response assertion",
    );
    results.push({ label: "Check 5: error-path 400 assertion", result: check5 });
  } else {
    // Stub out checks 2–5 as failed since the file is missing
    for (const label of [
      "Check 2: GET / health assertion",
      "Check 3: createAgentStackMiddleware spy",
      "Check 4: happy-path 2xx assertion",
      "Check 5: error-path 400 assertion",
    ]) {
      results.push({
        label,
        result: { pass: false, message: "skipped — smoke.test.ts missing" },
      });
    }
  }

  // Check 6: prim.yaml has required fields
  if (existsSync(primYamlPath)) {
    const yamlContent = readFileSync(primYamlPath, "utf8");
    results.push({
      label: "Check 6: prim.yaml required fields",
      result: checkYamlFields(yamlContent, REQUIRED_YAML_FIELDS),
    });
  } else {
    results.push({
      label: "Check 6: prim.yaml required fields",
      result: { pass: false, message: `prim.yaml not found at packages/${primId}/prim.yaml` },
    });
  }

  // Check 7: src/index.ts uses createPrimApp()
  if (existsSync(indexTsPath)) {
    const indexContent = readFileSync(indexTsPath, "utf8");
    results.push({
      label: "Check 7: src/index.ts uses createPrimApp()",
      result: checkPattern(indexContent, /createPrimApp\(/, "createPrimApp() call", "src/index.ts"),
    });
  } else {
    results.push({
      label: "Check 7: src/index.ts uses createPrimApp()",
      result: { pass: false, message: `src/index.ts not found at packages/${primId}/src/index.ts` },
    });
  }

  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const prims = loadPrimitives();
  const deployedPrims = deployed(prims);

  if (deployedPrims.length === 0) {
    console.log("\nNo live prims found — nothing to check.\n");
    process.exit(0);
  }

  console.log(`\n=== Conformance Check (${deployedPrims.length} live prims) ===\n`);

  const reports: PrimReport[] = [];
  let totalFails = 0;

  for (const prim of deployedPrims) {
    // Detect free service: freeService flag in prim.yaml (or absence of PRIM_PAY_TO in env)
    const primYamlPath = join(ROOT, "packages", prim.id, "prim.yaml");
    let isFreeService = false;
    if (existsSync(primYamlPath)) {
      const yamlContent = readFileSync(primYamlPath, "utf8");
      // Check for free_service: true in prim.yaml
      isFreeService = /^free_service:\s*true/m.test(yamlContent);
      // Also detect if PRIM_PAY_TO is absent from env list (faucet pattern)
      if (!isFreeService && prim.env) {
        isFreeService = !prim.env.includes("PRIM_PAY_TO");
      }
    }

    const checks = runChecks(prim.id, isFreeService);
    reports.push({ id: prim.id, checks });

    const failCount = checks.filter((c) => !c.result.pass).length;
    totalFails += failCount;

    const status =
      failCount === 0 ? "PASS" : `FAIL (${failCount} check${failCount > 1 ? "s" : ""})`;
    const statusIcon = failCount === 0 ? "✓" : "✗";
    console.log(`${statusIcon} ${prim.id}  [${status}]${isFreeService ? "  (free service)" : ""}`);

    for (const { label, result } of checks) {
      const icon = result.pass ? "  ✓" : "  ✗";
      if (!result.pass) {
        console.log(`${icon} ${label}`);
        console.log(`      → ${result.message}`);
      }
    }

    if (failCount > 0) {
      console.log();
    }
  }

  console.log(`\n${"─".repeat(50)}`);

  if (totalFails === 0) {
    console.log(`\n✓ All ${deployedPrims.length} live prims pass conformance.\n`);
    process.exit(0);
  } else {
    const failingPrims = reports.filter((r) => r.checks.some((c) => !c.result.pass)).length;
    console.log(
      `\n✗ Conformance failed — ${failingPrims} prim${failingPrims > 1 ? "s" : ""} have issues (${totalFails} total check failure${totalFails > 1 ? "s" : ""}).\n`,
    );
    process.exit(1);
  }
}

main();
