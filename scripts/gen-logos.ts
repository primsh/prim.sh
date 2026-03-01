#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-logos.ts — SVG logo generator
 *
 * Generates the full logo mark set (>, >|, >_, >!) for:
 *   - brand/ — master set in brand colors (green #00ff88 / cyan #4DD0E1)
 *   - <prim-id>/ — per-prim set using each prim's accent color
 *
 * Each mark gets two variants: dark background (#0a0a0a) and transparent.
 *
 * Usage:
 *   bun scripts/gen-logos.ts          # regenerate all logos
 *   bun scripts/gen-logos.ts --check  # verify logos are up to date
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CATEGORY_COLORS, TYPE_TO_CATEGORY, loadPrimitives } from "./lib/primitives.js";
import type { PrimCategory } from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");
const OUT_DIR = join(ROOT, "site/assets/logos");
const CHECK_MODE = process.argv.includes("--check");
let anyFailed = false;

// ── SVG templates ──────────────────────────────────────────────────────────

interface MarkConfig {
  primary: string; // chevron color
  secondary: string; // cursor color
  bg: string | null; // null = transparent
}

function chevron(cfg: MarkConfig): string {
  const bg = cfg.bg ? `\n  <rect width="120" height="120" fill="${cfg.bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${bg}
  <path d="M 30 30 L 70 60 L 30 90" fill="none" stroke="${cfg.primary}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

function bar(cfg: MarkConfig): string {
  const bg = cfg.bg ? `\n  <rect width="120" height="120" fill="${cfg.bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${bg}
  <path d="M 25 30 L 65 60 L 25 90" fill="none" stroke="${cfg.primary}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="85" y1="28" x2="85" y2="92" stroke="${cfg.secondary}" stroke-width="8" stroke-linecap="round"/>
</svg>
`;
}

function underscore(cfg: MarkConfig): string {
  const bg = cfg.bg ? `\n  <rect width="120" height="120" fill="${cfg.bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${bg}
  <path d="M 25 30 L 65 60 L 25 90" fill="none" stroke="${cfg.primary}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="78" y1="90" x2="98" y2="90" stroke="${cfg.secondary}" stroke-width="8" stroke-linecap="round"/>
</svg>
`;
}

function bang(cfg: MarkConfig): string {
  const bg = cfg.bg ? `\n  <rect width="120" height="120" fill="${cfg.bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${bg}
  <path d="M 25 30 L 65 60 L 25 90" fill="none" stroke="${cfg.primary}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="88" y1="28" x2="88" y2="72" stroke="${cfg.secondary}" stroke-width="8" stroke-linecap="round"/>
  <circle cx="88" cy="90" r="5" fill="${cfg.secondary}"/>
</svg>
`;
}

const MARKS: Record<string, (cfg: MarkConfig) => string> = {
  chevron,
  bar,
  underscore,
  bang,
};

// ── Writer ─────────────────────────────────────────────────────────────────

function writeOrCheck(filePath: string, content: string): void {
  if (CHECK_MODE) {
    if (!existsSync(filePath)) {
      console.error(`MISSING: ${filePath}`);
      anyFailed = true;
      return;
    }
    const existing = readFileSync(filePath, "utf-8");
    if (existing !== content) {
      console.error(`STALE: ${filePath}`);
      anyFailed = true;
    }
  } else {
    writeFileSync(filePath, content);
  }
}

function generateSet(dir: string, primary: string, secondary: string): void {
  mkdirSync(dir, { recursive: true });

  for (const [name, render] of Object.entries(MARKS)) {
    writeOrCheck(join(dir, `${name}.svg`), render({ primary, secondary, bg: "#0a0a0a" }));
    writeOrCheck(join(dir, `${name}-transparent.svg`), render({ primary, secondary, bg: null }));
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

// Brand set: green chevron, cyan cursor
const BRAND_PRIMARY = "#00ff88";
const BRAND_SECONDARY = "#4DD0E1";

console.log("[gen-logos] brand/");
generateSet(join(OUT_DIR, "brand"), BRAND_PRIMARY, BRAND_SECONDARY);

// Per-category sets: one logo set per category
for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
  console.log(`[gen-logos] category/${cat}/`);
  generateSet(join(OUT_DIR, "category", cat), color, color);
}

// Per-prim sets: use category color (falls back to accent if no category)
const prims = loadPrimitives(ROOT);
for (const p of prims) {
  const category = p.category ?? TYPE_TO_CATEGORY[p.type];
  const color = category ? CATEGORY_COLORS[category as PrimCategory] : p.accent;
  if (!color) continue;
  console.log(`[gen-logos] ${p.id}/`);
  generateSet(join(OUT_DIR, p.id), color, color);
}

if (CHECK_MODE) {
  if (anyFailed) {
    console.error("\n[gen-logos] Some logos are stale or missing. Run: bun scripts/gen-logos.ts");
    process.exit(1);
  } else {
    console.log("[gen-logos] All logos up to date.");
  }
} else {
  console.log("[gen-logos] Done.");
}
