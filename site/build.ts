// site/build.ts — Build static dist from site/ with template substitution
// Usage: bun run site/build.ts
// Output: site-dist/ (index.html + prim subpages rendered from prim.yaml)
//
// Cards in index.html are managed by gen-prims.ts (source of truth).
// This script only does brand copy substitution and prim subpage rendering.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse } from "yaml";
import { render, renderFooter, type PrimConfig } from "./template.ts";
import { BRAND } from "../brand.ts";

const ROOT = resolve(import.meta.dir, "..");

// ── index.html ───────────────────────────────────────────────────────────────

const src = readFileSync(resolve(ROOT, "site/index.html"), "utf-8");
const out = src
  .replace("{{tagline}}", BRAND.tagline)
  .replace("{{sub}}", BRAND.sub)
  .replace("{{closer}}", BRAND.closer)
  .replace("{{footer}}", renderFooter(BRAND.name));

mkdirSync(resolve(ROOT, "site-dist"), { recursive: true });
writeFileSync(resolve(ROOT, "site-dist/index.html"), out);
console.log("[build] site-dist/index.html written");

// ── access page ──────────────────────────────────────────────────────────────

const accessPath = resolve(ROOT, "site/access/index.html");
if (existsSync(accessPath)) {
  const accessSrc = readFileSync(accessPath, "utf-8");
  const accessOut = accessSrc.replace("{{footer:access}}", renderFooter(`<a href="/">${BRAND.name}</a> / access`));
  mkdirSync(resolve(ROOT, "site-dist/access"), { recursive: true });
  writeFileSync(resolve(ROOT, "site-dist/access/index.html"), accessOut);
  console.log("[build] site-dist/access/index.html written");
}

// ── prim subpages from prim.yaml ─────────────────────────────────────────────

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

let primCount = 0;
for (const id of primIds) {
  const cfg = loadPrimYaml(id);
  if (!cfg || !cfg.tagline || !cfg.sub) continue;
  const html = render(cfg);
  mkdirSync(resolve(ROOT, `site-dist/${cfg.id}`), { recursive: true });
  writeFileSync(resolve(ROOT, `site-dist/${cfg.id}/index.html`), html);
  primCount++;
}
console.log(`[build] ${primCount} prim pages written`);
