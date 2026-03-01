#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-og-images.ts — OG image generator
 *
 * Generates 1200×630 PNG social preview cards for each primitive
 * and a brand card for the main prim.sh page.
 *
 * Uses category colors and the >| logo mark from prim.yaml.
 *
 * Usage:
 *   bun scripts/gen-og-images.ts          # regenerate all OG images
 *   bun scripts/gen-og-images.ts --check  # verify images are up to date
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { BRAND } from "../site/brand.js";
import { loadSFMono, extractGlyphs } from "./lib/font.js";
import { CATEGORY_COLORS, TYPE_TO_CATEGORY, loadPrimitives } from "./lib/primitives.js";
import type { PrimCategory } from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");
const OUT_DIR = join(ROOT, "site/assets/og");
const CHECK_MODE = process.argv.includes("--check");
let anyFailed = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

const W = 1200;
const H = 630;
const FONT = `'SF Mono', SFMono-Regular, Menlo, Monaco, 'Cascadia Code', Consolas, 'Courier New', monospace`;
const BG = "#0a0a0a";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Word-wrap text to fit within maxChars per line */
function wordWrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars) {
      lines.push(current.trim());
      current = word;
    } else {
      current += (current ? " " : "") + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

// ── SVG Templates ────────────────────────────────────────────────────────────

const font = loadSFMono();

/** The >| bar mark (scaled to fit the card, SF Mono extraction) */
function logoMark(accent: string): string {
  const markSize = 120;
  const d = extractGlyphs(font, ">|", { w: markSize, h: markSize, pad: 10 });
  return `<g transform="translate(80, 140) scale(2.2)">
    <path d="${d}" fill="${accent}" stroke="${accent}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" stroke-miterlimit="1" paint-order="stroke"/>
  </g>`;
}

/** Per-primitive card */
function primCard(cfg: {
  name: string;
  description: string;
  accent: string;
  category: string;
}): string {
  const descLines = wordWrap(cfg.description, 45).slice(0, 3);
  const descSvg = descLines
    .map((line, i) => `<tspan x="420" dy="${i === 0 ? "0" : "36"}">${esc(line)}</tspan>`)
    .join("\n      ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <defs>
    <radialGradient id="glow" cx="35%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${cfg.accent}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${cfg.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${logoMark(cfg.accent)}

  <text x="420" y="220" font-family="${FONT}" font-size="60" font-weight="700" fill="${cfg.accent}">${esc(cfg.name)}</text>

  <text x="420" y="290" font-family="${FONT}" font-size="24" fill="#999">
      ${descSvg}
  </text>

  <line x1="80" y1="520" x2="1120" y2="520" stroke="#1a1a1a" stroke-width="1"/>
  <text x="80" y="565" font-family="${FONT}" font-size="22" fill="#666">prim.sh</text>
  <text x="1120" y="565" font-family="${FONT}" font-size="18" fill="#444" text-anchor="end">${esc(cfg.category)} · x402 · USDC on Base</text>
</svg>`;
}

/** Brand card for the main prim.sh landing page */
function brandCard(): string {
  const green = CATEGORY_COLORS.crypto;
  const cyan = CATEGORY_COLORS.compute;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <defs>
    <radialGradient id="glow" cx="35%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${green}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${green}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${logoMark(green)}

  <text x="420" y="210" font-family="${FONT}" font-size="72" font-weight="700" fill="${green}">prim<tspan fill="#e0e0e0">.sh</tspan></text>
  <text x="420" y="270" font-family="${FONT}" font-size="28" fill="#999">${esc(BRAND.tagline)}</text>
  <text x="420" y="320" font-family="${FONT}" font-size="22" fill="#666">${esc(BRAND.sub)}</text>

  <line x1="80" y1="520" x2="1120" y2="520" stroke="#1a1a1a" stroke-width="1"/>
  <text x="80" y="565" font-family="${FONT}" font-size="22" fill="#666">prim.sh</text>
  <text x="1120" y="565" font-family="${FONT}" font-size="18" fill="#444" text-anchor="end">♾️ primitives · x402 · USDC on Base</text>
</svg>`;
}

// ── Renderer ─────────────────────────────────────────────────────────────────

function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width" as const, value: W },
    font: { loadSystemFonts: true },
  });
  return Buffer.from(resvg.render().asPng());
}

function writeOrCheck(filePath: string, content: Buffer): void {
  if (CHECK_MODE) {
    if (!existsSync(filePath)) {
      console.error(`  MISSING: ${filePath}`);
      anyFailed = true;
      return;
    }
    const existing = readFileSync(filePath);
    if (!existing.equals(content)) {
      console.error(`  STALE: ${filePath}`);
      anyFailed = true;
    }
  } else {
    writeFileSync(filePath, content);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });

// Brand card
console.log("[gen-og] brand.png");
writeOrCheck(join(OUT_DIR, "brand.png"), svgToPng(brandCard()));

// Per-prim cards
const prims = loadPrimitives(ROOT);
for (const p of prims) {
  if (!p.name || !p.description) continue;
  const category = (p.category ?? TYPE_TO_CATEGORY[p.type] ?? "meta") as PrimCategory;
  const accent = p.accent ?? CATEGORY_COLORS[category] ?? CATEGORY_COLORS.meta;

  console.log(`[gen-og] ${p.id}.png`);
  const svg = primCard({
    name: p.name,
    description: p.description,
    accent,
    category,
  });
  writeOrCheck(join(OUT_DIR, `${p.id}.png`), svgToPng(svg));
}

if (CHECK_MODE) {
  if (anyFailed) {
    console.error(
      "\n[gen-og] Some OG images are stale or missing. Run: bun scripts/gen-og-images.ts",
    );
    process.exit(1);
  } else {
    console.log("[gen-og] All OG images up to date.");
  }
} else {
  console.log(`[gen-og] Done. ${prims.length + 1} images written to site/assets/og/`);
}
