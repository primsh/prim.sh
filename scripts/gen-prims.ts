#!/usr/bin/env bun
/**
 * gen-prims.ts — Primitives codegen
 *
 * Reads packages/<id>/prim.yaml (built primitives) + root primitives.yaml (all),
 * merges them, and regenerates marker-bounded sections in target files.
 *
 * Usage:
 *   bun scripts/gen-prims.ts          # regenerate all targets
 *   bun scripts/gen-prims.ts --check  # diff against disk, exit 1 if any file would change
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(import.meta.dir, "..");
const CHECK_MODE = process.argv.includes("--check");

// ── Types ──────────────────────────────────────────────────────────────────

interface PricingRow {
  op: string;
  price: string;
  note?: string;
}

interface Primitive {
  id: string;
  name: string;
  endpoint?: string;
  status: "coming_soon" | "building" | "built" | "testing" | "production";
  type: string;
  card_class: string;
  description: string;
  port?: number;
  order: number;
  phantom?: boolean;
  show_on_index?: boolean;
  env?: string[];
  pricing?: PricingRow[];
}

// ── Load + merge primitives ────────────────────────────────────────────────

function loadPrimitives(): Primitive[] {
  // 1. Load root registry
  const rootYaml = readFileSync(join(ROOT, "primitives.yaml"), "utf8");
  const rootData = parseYaml(rootYaml) as { primitives: Partial<Primitive>[] };
  const rootMap = new Map<string, Partial<Primitive>>();
  for (const p of rootData.primitives) {
    if (p.id) rootMap.set(p.id, p);
  }

  // 2. Load package yamls, merge over root
  const packagesDir = join(ROOT, "packages");
  const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of packageDirs) {
    const yamlPath = join(packagesDir, dir, "prim.yaml");
    if (!existsSync(yamlPath)) continue;
    const data = parseYaml(readFileSync(yamlPath, "utf8")) as Partial<Primitive>;
    if (!data.id) continue;
    const base = rootMap.get(data.id) ?? {};
    rootMap.set(data.id, { ...base, ...data });
  }

  // 3. Sort by order, apply defaults
  return Array.from(rootMap.values())
    .map((p) => ({
      show_on_index: true,
      phantom: false,
      ...p,
    }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999)) as Primitive[];
}

// ── Marker injection ───────────────────────────────────────────────────────

type CommentStyle = "html" | "js";

function inject(
  filePath: string,
  section: string,
  content: string,
  style: CommentStyle = "html"
): { changed: boolean; result: string; missing?: boolean } {
  const [open, close] =
    style === "html"
      ? [`<!-- BEGIN:PRIM:${section} -->`, `<!-- END:PRIM:${section} -->`]
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

function applyOrCheck(filePath: string, section: string, content: string, style: CommentStyle = "html", required = true): void {
  const { changed, result, missing } = inject(filePath, section, content, style);
  if (missing) {
    if (required) {
      console.error(`  ✗ ${filePath} [${section}] missing markers — run pnpm gen:prims after adding them`);
      anyFailed = true;
    } else {
      console.log(`  – ${filePath} [${section}] no markers (skipped)`);
    }
    return;
  }
  if (CHECK_MODE) {
    if (changed) {
      console.error(`  ✗ ${filePath} [${section}] is out of date — run pnpm gen:prims`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${filePath} [${section}]`);
    }
  } else {
    writeFileSync(filePath, result);
    console.log(`  ${changed ? "↺" : "✓"} ${filePath} [${section}]`);
  }
}

let anyFailed = false;

// ── Generators ─────────────────────────────────────────────────────────────

function genCards(prims: Primitive[]): string {
  const cards = prims.filter((p) => p.show_on_index !== false);
  return cards
    .map((p) => {
      const isActive = p.status === "testing" || p.status === "production";
      const cls = [
        "product",
        p.card_class,
        !isActive && !p.phantom ? "soon" : "",
        p.phantom ? "phantom" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const link = isActive
        ? `      <a href="/${p.id}" class="product-link">→ ${p.name}</a>`
        : `      <span class="soon-label">soon</span>`;

      return `    <div class="${cls}">
      <div class="product-name">${p.name}</div>
      <div class="product-type">${p.type}</div>
      <div class="product-desc">${p.description}</div>
${link}
    </div>`;
    })
    .join("\n");
}

function genLlmsTxtSections(prims: Primitive[]): string {
  const live = prims.filter((p) => p.status === "testing" || p.status === "production");
  const built = prims.filter((p) => p.status === "built");
  const planned = prims.filter((p) => p.status === "coming_soon" || p.status === "building");

  const fmtLive = (p: Primitive) =>
    `- ${p.name} — ${p.endpoint ?? `${p.id}.prim.sh`} — ${p.description}`;
  const fmtOther = (p: Primitive) => `- ${p.name} — ${p.description}`;

  return [
    `## Live Primitives\n\n${live.map(fmtLive).join("\n")}`,
    `## Built (Not Yet Deployed)\n\n${built.length ? built.map(fmtOther).join("\n") : "(none)"}`,
    `## Planned Primitives\n\n${planned.map(fmtOther).join("\n")}`,
  ].join("\n\n");
}

function genReadmeTable(prims: Primitive[]): string {
  const rows = prims
    .filter((p) => p.show_on_index !== false)
    .map((p) => {
      const statusLabel =
        p.status === "testing"
          ? "Live (testnet)"
          : p.status === "production"
            ? "Live"
            : p.status === "built"
              ? "Built"
              : "Coming soon";
      const link = p.endpoint ? `[${p.name}](https://${p.endpoint})` : p.name;
      return `| ${link} | ${p.description} | ${statusLabel} |`;
    });
  return `| Primitive | What it does | Status |\n|-----------|-------------|--------|\n${rows.join("\n")}`;
}

function genPreDeployEnvs(prims: Primitive[]): string {
  const built = prims.filter((p) => p.env && p.env.length > 0);
  const entries = built
    .map((p) => `  ${p.id}: [${p.env!.map((e) => `"${e}"`).join(", ")}],`)
    .join("\n");
  return `const REQUIRED_ENV: Record<Primitive, string[]> = {\n${entries}\n};`;
}

function genStatusBadge(p: Primitive): string {
  const labels: Record<string, string> = {
    testing: "● Live (testnet)",
    production: "● Live",
    built: "○ Built — deploy pending",
    building: "◌ In development",
    coming_soon: "◌ Coming soon",
  };
  const classes: Record<string, string> = {
    testing: "status-testing",
    production: "status-live",
    built: "status-built",
    building: "status-building",
    coming_soon: "status-soon",
  };
  const label = labels[p.status] ?? p.status;
  const cls = classes[p.status] ?? "status-soon";
  return `    <span class="badge ${cls}">${label}</span>`;
}

function genPricingRows(p: Primitive): string {
  if (!p.pricing || p.pricing.length === 0) return "";
  return p.pricing
    .map((row) => `      <tr><td>${row.op}</td><td>${row.price}</td><td>${row.note ?? ""}</td></tr>`)
    .join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

const prims = loadPrimitives();
console.log(`Loaded ${prims.length} primitives`);
console.log(CHECK_MODE ? "Mode: check\n" : "Mode: generate\n");

// 1. site/index.html — cards grid
applyOrCheck(join(ROOT, "site/index.html"), "CARDS", genCards(prims));

// 2. site/llms.txt — status sections
applyOrCheck(join(ROOT, "site/llms.txt"), "STATUS", genLlmsTxtSections(prims));

// 3. README.md — primitive table
applyOrCheck(join(ROOT, "README.md"), "PRIMS", genReadmeTable(prims));

// 4. scripts/pre-deploy.ts — env arrays
applyOrCheck(join(ROOT, "scripts/pre-deploy.ts"), "ENV", genPreDeployEnvs(prims), "js");

// 5. Per-page status badge + pricing
for (const p of prims) {
  const pagePath = join(ROOT, "site", p.id, "index.html");
  if (!existsSync(pagePath)) continue;
  applyOrCheck(pagePath, "STATUS", genStatusBadge(p), "html", false);
  if (p.pricing && p.pricing.length > 0) {
    applyOrCheck(pagePath, "PRICING", genPricingRows(p), "html", false);
  }
}

if (CHECK_MODE && anyFailed) {
  console.error("\nSome files are out of date. Run: pnpm gen:prims");
  process.exit(1);
} else if (CHECK_MODE) {
  console.log("\nAll generated files are up to date.");
} else {
  console.log("\nDone.");
}
