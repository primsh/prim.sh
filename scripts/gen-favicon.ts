#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-favicon.ts — generate favicon from SF Mono chevron glyph
 *
 * Uses the same font extraction + paint-order stroke rounding as
 * gen-terminal-world.ts. Outputs SVG + rasterizes to PNG via @resvg/resvg-js.
 *
 * Usage: bun scripts/gen-favicon.ts
 */

import opentype from "opentype.js";
import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUT_SVG = join(ROOT, "site/assets/favicon.svg");
const OUT_PNG = join(ROOT, "site/assets/favicon.png");
const FONT_PATH =
  "/Applications/Xcode.app/Contents/SharedFrameworks/DVTUserInterfaceKit.framework/Versions/A/Resources/Fonts/SF-Mono.ttf";

const font = opentype.loadSync(FONT_PATH);

// ── Font extraction (from gen-terminal-world.ts) ─────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: opentype.js command types
function cmdToD(commands: any[], scale: number, ox: number, oy: number): string {
  const tx = (x: number) => (x * scale + ox).toFixed(1);
  const ty = (y: number) => (y * scale + oy).toFixed(1);
  let d = "";
  for (const c of commands) {
    switch (c.type) {
      case "M": d += `M${tx(c.x)} ${ty(c.y)}`; break;
      case "L": d += `L${tx(c.x)} ${ty(c.y)}`; break;
      case "Q": d += `Q${tx(c.x1)} ${ty(c.y1)} ${tx(c.x)} ${ty(c.y)}`; break;
      case "C": d += `C${tx(c.x1)} ${ty(c.y1)} ${tx(c.x2)} ${ty(c.y2)} ${tx(c.x)} ${ty(c.y)}`; break;
      case "Z": d += "Z"; break;
    }
  }
  return d;
}

// ── Generate favicon ─────────────────────────────────────────────────────────

const SIZE = 256;
const cx = SIZE / 2;
const cy = SIZE / 2;
const R = 118; // circle radius
const GREEN = "#00ff88";
const BG = "#0a0a0a";
const BORDER = "#222";
const STROKE_ROUND = 14;

// Extract > glyph path from SF Mono
const refSize = 200;
const path = font.getPath(">", 0, 0, refSize);
const bb = path.getBoundingBox();
const gW = bb.x2 - bb.x1;
const gH = bb.y2 - bb.y1;

// Scale to fit inside circle with padding
const pad = 56;
const maxW = R * 2 - pad * 2;
const maxH = R * 2 - pad * 2;
const scale = Math.min(maxW / gW, maxH / gH);

// Center in circle
const ox = cx - (bb.x1 * scale + gW * scale / 2);
const oy = cy - (bb.y1 * scale + gH * scale / 2);
const d = cmdToD(path.commands, scale, ox, oy);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="${BG}"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${BORDER}" stroke-width="2"/>
  <path d="${d}" fill="${GREEN}" stroke="${GREEN}" stroke-width="${STROKE_ROUND}" stroke-linejoin="round" stroke-linecap="round" stroke-miterlimit="1" paint-order="stroke"/>
</svg>
`;

writeFileSync(OUT_SVG, svg);
console.log(`  ✓ ${OUT_SVG}`);

// Rasterize to PNG
try {
  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 256 } });
  const png = resvg.render().asPng();
  writeFileSync(OUT_PNG, png);
  console.log(`  ✓ ${OUT_PNG} (${png.length} bytes)`);
} catch {
  console.log(`  – ${OUT_PNG} (skipped — @resvg/resvg-js not installed)`);
  console.log("    Install with: pnpm add -D @resvg/resvg-js");
}
