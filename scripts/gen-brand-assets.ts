#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-brand-assets.ts — generate all brand identity assets
 *
 * Marks use custom geometry (not font extraction). The chevron is the atom —
 * a wide-angle stroke path — and all 7 marks compose from it.
 * Wordmark/lockup use SF Mono for "prim.sh" text with shared baseline.
 *
 * All output goes to brand/ (gitignored).
 * Favicons are copied to site/assets/ for serving.
 *
 * Usage:
 *   bun scripts/gen-brand-assets.ts          # regenerate all assets
 *   bun scripts/gen-brand-assets.ts --check  # verify assets are up to date
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { BRAND } from "../site/brand.js";
import { loadSFMono, cmdToD } from "./lib/font.js";
import { esc, svgToPng, writeOrCheck } from "./lib/svg.js";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "brand");
const SITE_ASSETS = join(ROOT, "site/assets");
const CHECK_MODE = process.argv.includes("--check");
let anyFailed = false;

// ── Brand constants ──────────────────────────────────────────────────────────

const GREEN = "#00ff88";
const BG = "#0a0a0a";
const TEXT = "#e0e0e0";
const BORDER = "#222";
const FONT_STACK = `'SF Mono', SFMono-Regular, Menlo, Monaco, 'Cascadia Code', Consolas, 'Courier New', monospace`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function write(path: string, content: string | Buffer): void {
  if (!writeOrCheck(path, content, CHECK_MODE)) {
    anyFailed = true;
  }
}

async function writePng(path: string, svg: string, width: number): Promise<void> {
  const png = await svgToPng(svg, width, { loadSystemFonts: true });
  if (png) {
    write(path, png);
  } else if (!CHECK_MODE) {
    console.log(`  – ${path} (skipped — @resvg/resvg-js not installed)`);
  }
}

function ensureDir(dir: string): void {
  if (!CHECK_MODE) mkdirSync(dir, { recursive: true });
}

// ── Custom mark geometry ─────────────────────────────────────────────────────
//
// The chevron is the atom. All marks compose from it.
//
// Chevron geometry (in a unit content box, scaled to fit):
//   - Two stroked lines: top-left → apex → bottom-left
//   - ~90° opening angle (wide, distinctive)
//   - Stroke with round caps/joins for the rounded look
//
// All suffix elements (|, _, !, >, *, |)) use the same full height
// and consistent stroke width.

interface MarkGeometry {
  /** SVG content (paths/lines) to place inside a <g> */
  content: string;
  /** Logical width of the content (for centering in viewport) */
  width: number;
  /** Logical height of the content */
  height: number;
}

/**
 * Build the base chevron path.
 * h = full height, w = horizontal depth of the chevron.
 * Wider w = wider angle (~90° opening).
 */
function chevronPath(h: number, w: number): string {
  return `M0 0 L${w} ${h / 2} L0 ${h}`;
}

/**
 * Build mark geometry for a given mark ID.
 *
 * Width/height returned are VISUAL bounds (includes stroke overshoot).
 * Content is drawn offset by sw/2 so the visual left/top is at (0,0).
 */
function buildMark(id: string, h: number, sw: number): MarkGeometry {
  const half = sw / 2;
  // Chevron: width is 55% of height for ~90° opening angle
  const cw = h * 0.55;
  // Gap between elements — visual gap after accounting for stroke
  const gap = sw * 2.5;

  // Offset all content by sw/2 so visual bounds start at (0,0)
  const ox = half;
  const oy = half;

  const chevron = `<path d="M${ox} ${oy} L${ox + cw} ${oy + h / 2} L${ox} ${oy + h}" fill="none" stroke-width="${sw}"/>`;
  const chevVisualW = cw + sw; // sw/2 on each side
  const chevVisualH = h + sw;

  switch (id) {
    case "chevron":
      return { content: chevron, width: chevVisualW, height: chevVisualH };

    case "bar": {
      const barX = ox + cw + gap;
      const bar = `<line x1="${barX}" y1="${oy}" x2="${barX}" y2="${oy + h}" stroke-width="${sw}"/>`;
      return { content: chevron + bar, width: barX + half, height: chevVisualH };
    }

    case "underscore": {
      const uX = ox + cw + gap;
      const uW = h * 0.42;
      const line = `<line x1="${uX}" y1="${oy + h}" x2="${uX + uW}" y2="${oy + h}" stroke-width="${sw}"/>`;
      return { content: chevron + line, width: uX + uW + half, height: chevVisualH };
    }

    case "append": {
      const c2x = ox + cw * 0.7;
      const c2 = `<path d="M${c2x} ${oy} L${c2x + cw} ${oy + h / 2} L${c2x} ${oy + h}" fill="none" stroke-width="${sw}"/>`;
      return { content: chevron + c2, width: c2x + cw + half, height: chevVisualH };
    }

    case "bang": {
      // ! spans full height of chevron. Dot bottom aligns with chevron stroke bottom.
      const bX = ox + cw + gap;
      const dotR = sw * 0.55;
      const visualGap = sw * 0.8; // visible gap between bar end and dot top
      // Align dot bottom with chevron visual bottom (oy + h + half)
      const dotCy = oy + h + half - dotR;
      // Line stroke extends half below lineEnd, so subtract half for true visual gap
      const lineEnd = dotCy - dotR - visualGap - half;
      const line = `<line x1="${bX}" y1="${oy}" x2="${bX}" y2="${lineEnd}" stroke-width="${sw}"/>`;
      const dot = `<circle cx="${bX}" cy="${dotCy}" r="${dotR}"/>`;
      return { content: chevron + line + dot, width: bX + half, height: chevVisualH };
    }

    case "dekey": {
      const barX = ox + cw + gap;
      const bar = `<line x1="${barX}" y1="${oy}" x2="${barX}" y2="${oy + h}" stroke-width="${sw}"/>`;
      const parenX = barX + gap;
      const parenW = h * 0.22;
      const paren = `<path d="M${parenX} ${oy} Q${parenX + parenW} ${oy + h / 2} ${parenX} ${oy + h}" fill="none" stroke-width="${sw}"/>`;
      return { content: chevron + bar + paren, width: parenX + parenW * 0.5 + half, height: chevVisualH };
    }

    case "glob": {
      // >* — asterisk is same height as chevron, with clear gap
      const aR = h * 0.5; // radius — matches chevron visual height (2*aR + sw = h + sw)
      const aX = ox + cw + gap + aR; // center of asterisk
      const cy = oy + h / 2;
      const arms: string[] = [];
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI) / 3;
        const dx = Math.cos(angle) * aR;
        const dy = Math.sin(angle) * aR;
        arms.push(
          `<line x1="${(aX - dx).toFixed(1)}" y1="${(cy - dy).toFixed(1)}" x2="${(aX + dx).toFixed(1)}" y2="${(cy + dy).toFixed(1)}" stroke-width="${sw}"/>`,
        );
      }
      return { content: chevron + arms.join(""), width: aX + aR + half, height: chevVisualH };
    }

    default:
      return { content: chevron, width: chevVisualW, height: chevVisualH };
  }
}

/** Render a complete mark SVG */
function renderMark(
  id: string,
  opts: { size: number; bg: string | null; color: string; strokeWidth: number },
): string {
  const { size, bg, color, strokeWidth } = opts;
  const pad = size * 0.16;
  const maxW = size - pad * 2;
  const maxH = size - pad * 2;

  const mark = buildMark(id, maxH, strokeWidth);

  // Uniform scale to fit both dimensions
  const scale = Math.min(maxW / mark.width, maxH / mark.height);
  const scaledW = mark.width * scale;
  const scaledH = mark.height * scale;

  // Center in viewport
  const tx = (size - scaledW) / 2;
  const ty = (size - scaledH) / 2;

  const bgRect = bg ? `\n  <rect width="${size}" height="${size}" rx="16" fill="${bg}"/>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${bgRect}
  <g transform="translate(${tx.toFixed(1)}, ${ty.toFixed(1)}) scale(${scale.toFixed(4)})" stroke="${color}" fill="${color}" stroke-linecap="round" stroke-linejoin="round">
    ${mark.content}
  </g>
</svg>
`;
}

// ── Favicon ──────────────────────────────────────────────────────────────────

function renderFavicon(): string {
  const SIZE = 256;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 118;
  const sw = 12;

  // Chevron centered in circle
  const contentH = R * 1.2;
  const cw = contentH * 0.55;
  const mark = buildMark("chevron", contentH, sw);
  const tx = cx - mark.width / 2;
  const ty = cy - mark.height / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="${BG}"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${BORDER}" stroke-width="2"/>
  <g transform="translate(${tx.toFixed(1)}, ${ty.toFixed(1)})" stroke="${GREEN}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${mark.content}
  </g>
</svg>
`;
}

// ── Social / banner cards ────────────────────────────────────────────────────

function renderSocialCard(width: number, height: number): string {
  const markH = Math.min(height * 0.35, 160);
  const sw = Math.max(8, markH * 0.07);
  const mark = buildMark("chevron", markH, sw);
  const markX = width * 0.12;
  const markY = (height - mark.height) / 2;

  const textX = markX + mark.width + width * 0.08;
  const textY = height / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${BG}"/>
  <defs>
    <radialGradient id="glow" cx="25%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GREEN}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${GREEN}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <g transform="translate(${markX}, ${markY})" stroke="${GREEN}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${mark.content}
  </g>
  <text x="${textX}" y="${textY - 20}" font-family="${FONT_STACK}" font-size="48" font-weight="700" fill="${GREEN}">prim<tspan fill="${TEXT}">.sh</tspan></text>
  <text x="${textX}" y="${textY + 30}" font-family="${FONT_STACK}" font-size="20" fill="#999">${esc(BRAND.tagline)}</text>
</svg>`;
}

function renderBanner(width: number, height: number): string {
  const markH = Math.min(height * 0.45, 180);
  const sw = Math.max(8, markH * 0.07);
  const mark = buildMark("chevron", markH, sw);
  const cx = width / 2;
  const cy = height / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${BG}"/>
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GREEN}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${GREEN}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <g transform="translate(${(cx - mark.width / 2).toFixed(1)}, ${(cy - mark.height / 2).toFixed(1)})" stroke="${GREEN}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${mark.content}
  </g>
</svg>`;
}

// ── Wordmark ─────────────────────────────────────────────────────────────────

function renderWordmark(): string {
  const font = loadSFMono();
  const H = 80;
  const refSize = 60;
  const text = "prim.sh";
  const primLen = 4; // "prim" is green

  // Use font.getPath for the whole string to get correct baseline
  const fullPath = font.getPath(text, 0, 0, refSize);
  const fullBb = fullPath.getBoundingBox();

  // Get per-character paths with proper advance widths
  const glyph = font.charToGlyph("M");
  const advanceWidth = (glyph.advanceWidth ?? refSize * 0.6) * (refSize / font.unitsPerEm);

  const startX = 16;
  const baseline = (H + fullBb.y2 - fullBb.y1) / 2 - fullBb.y2; // center vertically using shared bbox

  let paths = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const path = font.getPath(char, 0, 0, refSize);
    const color = i < primLen ? GREEN : TEXT;

    const ox = startX + advanceWidth * i;
    const oy = baseline;
    const d = cmdToD(path.commands, 1, ox, oy);
    paths += `  <path d="${d}" fill="${color}"/>\n`;
  }

  const totalW = startX + advanceWidth * text.length + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW.toFixed(0)} ${H}" width="${totalW.toFixed(0)}" height="${H}">
${paths}</svg>
`;
}

// ── Lockup ───────────────────────────────────────────────────────────────────

function renderLockup(): string {
  const font = loadSFMono();
  const H = 80;
  const sw = 8;
  const markH = H * 0.7;
  const mark = buildMark("chevron", markH, sw);
  const markTy = (H - markH) / 2;
  const gap = 20;
  const textStartX = mark.width + gap;

  const refSize = 48;
  const text = "prim.sh";
  const primLen = 4;

  const fullPath = font.getPath(text, 0, 0, refSize);
  const fullBb = fullPath.getBoundingBox();

  const glyph = font.charToGlyph("M");
  const advanceWidth = (glyph.advanceWidth ?? refSize * 0.6) * (refSize / font.unitsPerEm);

  const baseline = (H + fullBb.y2 - fullBb.y1) / 2 - fullBb.y2;

  let wordPaths = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const path = font.getPath(char, 0, 0, refSize);
    const color = i < primLen ? GREEN : TEXT;

    const ox = textStartX + advanceWidth * i;
    const oy = baseline;
    const d = cmdToD(path.commands, 1, ox, oy);
    wordPaths += `  <path d="${d}" fill="${color}"/>\n`;
  }

  const totalW = textStartX + advanceWidth * text.length + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW.toFixed(0)} ${H}" width="${totalW.toFixed(0)}" height="${H}">
  <g transform="translate(0, ${markTy.toFixed(1)})" stroke="${GREEN}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${mark.content}
  </g>
${wordPaths}</svg>
`;
}

// ── Avatar (square, dark bg, chevron mark centered) ──────────────────────────

function renderAvatar(size: number): string {
  return renderMark("chevron", {
    size,
    bg: BG,
    color: GREEN,
    strokeWidth: Math.max(10, size * 0.05),
  });
}

// ── Mark definitions ─────────────────────────────────────────────────────────

const MARKS = [
  "chevron",
  "bar",
  "underscore",
  "append",
  "bang",
  "dekey",
  "glob",
] as const;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[gen-brand] Generating brand assets...");

  // Create output directories
  for (const sub of ["marks", "favicon", "avatars", "social"]) {
    ensureDir(join(OUT, sub));
  }

  // ── Marks (7 canonical × 2 variants) ────────────────────────────────────
  console.log("[gen-brand] marks/");
  for (const id of MARKS) {
    const sw = 14;
    const darkSvg = renderMark(id, { size: 256, bg: BG, color: GREEN, strokeWidth: sw });
    const transparentSvg = renderMark(id, { size: 256, bg: null, color: GREEN, strokeWidth: sw });
    write(join(OUT, "marks", `${id}.svg`), darkSvg);
    write(join(OUT, "marks", `${id}-transparent.svg`), transparentSvg);
  }

  // ── Favicon ─────────────────────────────────────────────────────────────
  console.log("[gen-brand] favicon/");
  const faviconSvg = renderFavicon();
  write(join(OUT, "favicon", "favicon.svg"), faviconSvg);
  await writePng(join(OUT, "favicon", "favicon-32.png"), faviconSvg, 32);
  await writePng(join(OUT, "favicon", "favicon-180.png"), faviconSvg, 180);
  await writePng(join(OUT, "favicon", "favicon-192.png"), faviconSvg, 192);
  await writePng(join(OUT, "favicon", "favicon-512.png"), faviconSvg, 512);

  // ── Avatars ─────────────────────────────────────────────────────────────
  console.log("[gen-brand] avatars/");
  for (const a of [
    { name: "github-500.png", size: 500 },
    { name: "x-400.png", size: 400 },
    { name: "discord-512.png", size: 512 },
  ]) {
    const svg = renderAvatar(a.size);
    await writePng(join(OUT, "avatars", a.name), svg, a.size);
  }

  // ── Social cards ────────────────────────────────────────────────────────
  console.log("[gen-brand] social/");
  await writePng(join(OUT, "social", "preview-1280x640.png"), renderSocialCard(1280, 640), 1280);
  await writePng(join(OUT, "social", "readme-hero-1200x400.png"), renderSocialCard(1200, 400), 1200);
  await writePng(join(OUT, "social", "x-banner-1500x500.png"), renderBanner(1500, 500), 1500);

  // ── Wordmark + Lockup ──────────────────────────────────────────────────
  console.log("[gen-brand] wordmark + lockup");
  write(join(OUT, "wordmark.svg"), renderWordmark());
  write(join(OUT, "lockup.svg"), renderLockup());

  // ── Copy favicons to site/assets/ for serving ───────────────────────────
  if (!CHECK_MODE) {
    console.log("[gen-brand] copying favicons → site/assets/");
    for (const f of ["favicon.svg", "favicon-32.png", "favicon-180.png", "favicon-192.png", "favicon-512.png"]) {
      try {
        copyFileSync(join(OUT, "favicon", f), join(SITE_ASSETS, f));
      } catch {
        // PNG may not exist if resvg not installed
      }
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  if (CHECK_MODE) {
    if (anyFailed) {
      console.error("\n[gen-brand] Some assets are stale or missing. Run: bun scripts/gen-brand-assets.ts");
      process.exit(1);
    }
    console.log("[gen-brand] All brand assets up to date.");
  } else {
    console.log("[gen-brand] Done.");
  }
}

main();
