#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-docs.ts — README + CLAUDE.md factory section generator
 *
 * Reads prim.yaml + api.ts for each package, generates README.md files
 * and injects factory workflow docs into CLAUDE.md.
 *
 * Usage:
 *   bun scripts/gen-docs.ts          # regenerate all targets
 *   bun scripts/gen-docs.ts --check  # diff against disk, exit 1 if any file would change
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseApiFile } from "./lib/parse-api.js";
import { loadPrimitives, withPackage } from "./lib/primitives.js";
import { parseRoutePrices } from "./lib/render-llms-txt.js";
import { renderReadme } from "./lib/render-readme.js";

const ROOT = resolve(import.meta.dir, "..");
const CHECK_MODE = process.argv.includes("--check");

let anyFailed = false;

// ── Marker injection ───────────────────────────────────────────────────────

type CommentStyle = "html" | "js" | "bash";

function inject(
  filePath: string,
  section: string,
  content: string,
  style: CommentStyle = "html",
): { changed: boolean; result: string; missing?: boolean } {
  const [open, close] =
    style === "html"
      ? [`<!-- BEGIN:PRIM:${section} -->`, `<!-- END:PRIM:${section} -->`]
      : style === "bash"
        ? [`# BEGIN:PRIM:${section}`, `# END:PRIM:${section}`]
        : [`// BEGIN:PRIM:${section}`, `// END:PRIM:${section}`];

  const original = readFileSync(filePath, "utf8");
  const openIdx = original.indexOf(open);
  const closeIdx = original.indexOf(close);

  if (openIdx === -1 || closeIdx === -1) {
    return { changed: false, result: original, missing: true };
  }

  const before = original.slice(0, openIdx + open.length);
  const after = original.slice(closeIdx);
  const result = `${before}\n${content}\n${after}`;
  const changed = result !== original;
  return { changed, result };
}

function applyOrCheck(
  filePath: string,
  section: string,
  content: string,
  style: CommentStyle = "html",
): void {
  const { changed, result, missing } = inject(filePath, section, content, style);
  if (missing) {
    console.error(
      `  ✗ ${filePath} [${section}] missing markers — add markers and run pnpm gen:docs`,
    );
    anyFailed = true;
    return;
  }
  if (CHECK_MODE) {
    if (changed) {
      console.error(`  ✗ ${filePath} [${section}] is out of date — run pnpm gen:docs`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${filePath} [${section}]`);
    }
  } else {
    writeFileSync(filePath, result);
    console.log(`  ${changed ? "↺" : "✓"} ${filePath} [${section}]`);
  }
}

function applyFullFile(filePath: string, content: string): void {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  const changed = existing !== content;
  if (CHECK_MODE) {
    if (changed) {
      console.error(`  ✗ ${filePath} is out of date — run pnpm gen:docs`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${filePath}`);
    }
  } else {
    writeFileSync(filePath, content);
    console.log(`  ${changed ? "↺" : "✓"} ${filePath}`);
  }
}

// ── Factory section content ────────────────────────────────────────────────

function genFactorySection(): string {
  return `
**Gen commands** (run from repo root):

| Command | What it does |
|---------|-------------|
| \`pnpm gen\` | Run all generators (prims, mcp, cli, tools, tests, docs) |
| \`pnpm gen:check\` | Check all generated files are up to date (CI) |
| \`pnpm gen:prims\` | Regenerate site cards, llms.txt, status badges, pricing rows |
| \`pnpm gen:mcp\` | Regenerate MCP server configs |
| \`pnpm gen:cli\` | Regenerate CLI tool definitions |
| \`pnpm gen:tools\` | Regenerate function-calling tool definitions |
| \`pnpm gen:tests\` | Regenerate smoke test scaffolds |
| \`pnpm gen:docs\` | Regenerate per-package READMEs + this section |

**Creating a new primitive:**

\`\`\`bash
pnpm create-prim           # Interactive wizard — creates prim.yaml, package, tests
pnpm gen                   # Regenerate all downstream files
\`\`\`

**Adding a provider to an existing primitive:**

\`\`\`bash
pnpm create-prim --provider   # Interactive provider scaffolder
\`\`\`

**Regenerating docs after changes:**

\`\`\`bash
pnpm gen:docs              # Regenerate READMEs from prim.yaml + api.ts
pnpm gen:docs --check      # Verify READMEs are fresh (CI gate)
\`\`\`
`.trim();
}

// ── Main ───────────────────────────────────────────────────────────────────

const prims = loadPrimitives();
const packaged = withPackage(prims, ROOT);
console.log(`Loaded ${prims.length} primitives (${packaged.length} with packages)`);
console.log(CHECK_MODE ? "Mode: check\n" : "Mode: generate\n");

// 1. Per-package READMEs
for (const p of packaged) {
  const pkgDir = join(ROOT, "packages", p.id);
  const apiPath = join(pkgDir, "src/api.ts");
  const indexPath = join(pkgDir, "src/index.ts");
  const readmePath = join(pkgDir, "README.md");

  const api = existsSync(apiPath) ? parseApiFile(apiPath) : null;
  const prices = existsSync(indexPath) ? parseRoutePrices(indexPath) : new Map<string, string>();

  const content = renderReadme(p, api, prices);
  applyFullFile(readmePath, content);
}

// 2. CLAUDE.md factory section
const claudeMdPath = join(ROOT, "CLAUDE.md");
if (existsSync(claudeMdPath)) {
  applyOrCheck(claudeMdPath, "FACTORY", genFactorySection());
}

// ── Exit ───────────────────────────────────────────────────────────────────

if (CHECK_MODE && anyFailed) {
  console.error("\nSome files are out of date. Run: pnpm gen:docs");
  process.exit(1);
} else if (CHECK_MODE) {
  console.log("\nAll generated files are up to date.");
} else {
  console.log("\nDone.");
}
