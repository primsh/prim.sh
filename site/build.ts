// site/build.ts — Build static dist from site/ with template substitution
// Usage: bun run site/build.ts
// Output: site-dist/ (index.html + prim subpages rendered from prim.yaml)

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse } from "yaml";
import { render, renderFooter, type PrimConfig } from "./template.ts";
import { BRAND } from "../brand.ts";

const ROOT = resolve(import.meta.dir, "..");

// ── load all prim configs ────────────────────────────────────────────────────

function loadPrimYaml(id: string): PrimConfig | null {
  const candidates = [
    join(ROOT, `packages/${id}/prim.yaml`),
    join(ROOT, `site/${id}/prim.yaml`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return parse(readFileSync(p, "utf-8")) as PrimConfig;
      } catch (e) {
        console.error(`[build] Failed to parse ${p}:`, e);
      }
    }
  }
  return null;
}

const primIds = new Set<string>();
for (const dir of readdirSync(join(ROOT, "packages"))) {
  if (existsSync(join(ROOT, `packages/${dir}/prim.yaml`))) primIds.add(dir);
}
for (const dir of readdirSync(join(ROOT, "site"))) {
  if (existsSync(join(ROOT, `site/${dir}/prim.yaml`))) primIds.add(dir);
}

const allConfigs: PrimConfig[] = [];
for (const id of primIds) {
  const cfg = loadPrimYaml(id);
  if (cfg) allConfigs.push(cfg);
}

// ── generate homepage cards from prim.yaml ───────────────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderCard(cfg: PrimConfig): string {
  const cls = cfg.card_class ?? "";
  const isLive = cfg.status === "deployed" || cfg.status === "testing";
  const isPhantom = cfg.phantom === true;

  const statusClass = isPhantom ? "phantom" : isLive ? "" : "soon";
  const classes = ["product", cls, statusClass].filter(Boolean).join(" ");

  const lines = [
    `    <div class="${classes}">`,
    `      <div class="product-name">${esc(cfg.name)}</div>`,
    `      <div class="product-type">${esc(cfg.type ?? "")}</div>`,
    `      <div class="product-desc">${esc(cfg.description ?? "")}</div>`,
  ];

  if (isLive) {
    lines.push(`      <a href="/${cfg.id}" class="product-link">\u2192 ${esc(cfg.name)}</a>`);
  } else {
    lines.push(`      <span class="soon-label">soon</span>`);
  }

  lines.push(`    </div>`);
  return lines.join("\n");
}

// Sort by order (prims without order go to the end)
const cardConfigs = allConfigs
  .filter((c) => c.card_class)
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

const cardsHtml = cardConfigs.map(renderCard).join("\n");

// ── index.html ───────────────────────────────────────────────────────────────

const src = readFileSync(resolve(ROOT, "site/index.html"), "utf-8");
const out = src
  .replace("{{tagline}}", BRAND.tagline)
  .replace("{{sub}}", BRAND.sub)
  .replace("{{closer}}", BRAND.closer)
  .replace("{{footer}}", renderFooter("prim.sh"))
  .replace(
    /<!-- BEGIN:PRIM:CARDS -->[\s\S]*?<!-- END:PRIM:CARDS -->/,
    `<!-- BEGIN:PRIM:CARDS -->\n${cardsHtml}\n<!-- END:PRIM:CARDS -->`,
  );

mkdirSync(resolve(ROOT, "site-dist"), { recursive: true });
writeFileSync(resolve(ROOT, "site-dist/index.html"), out);
console.log("[build] site-dist/index.html written");

// ── access page ──────────────────────────────────────────────────────────────

const accessPath = resolve(ROOT, "site/access/index.html");
if (existsSync(accessPath)) {
  const accessSrc = readFileSync(accessPath, "utf-8");
  const accessOut = accessSrc.replace("{{footer:access}}", renderFooter(`<a href="/">prim.sh</a> / access`));
  mkdirSync(resolve(ROOT, "site-dist/access"), { recursive: true });
  writeFileSync(resolve(ROOT, "site-dist/access/index.html"), accessOut);
  console.log("[build] site-dist/access/index.html written");
}

// ── prim subpages from prim.yaml ─────────────────────────────────────────────

let primCount = 0;
for (const cfg of allConfigs) {
  if (!cfg.tagline || !cfg.sub) continue;
  const html = render(cfg);
  mkdirSync(resolve(ROOT, `site-dist/${cfg.id}`), { recursive: true });
  writeFileSync(resolve(ROOT, `site-dist/${cfg.id}/index.html`), html);
  primCount++;
}
console.log(`[build] ${primCount} prim pages written`);
console.log(`[build] ${cardConfigs.length} cards generated from prim.yaml`);
