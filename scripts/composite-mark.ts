#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * composite-mark.ts — Stack surface + splatter + mark into a final composite
 *
 * Compositing order (back to front):
 *   1. Surface (background texture)
 *   2. Splatter (screen-blended — black becomes transparent, neon shows through)
 *   3. Mark (rasterized SVG, composited on top)
 *
 * Usage:
 *   bun scripts/composite-mark.ts <mark-id> <surface.png> <splatter.png>
 *   bun scripts/composite-mark.ts chevron brand/embellished/layers/surfaces/concrete-wall/.../layer.png brand/embellished/layers/splatters/galaxy/.../layer.png
 *
 * Flags:
 *   --no-splatter   Skip splatter layer (surface + mark only)
 *   --no-mark       Skip mark layer (surface + splatter only, for previewing)
 *   --mark-scale N  Scale mark to N% of canvas (default: 60)
 *   --mark-opacity N  Mark opacity 0-100 (default: 90)
 *   --splatter-opacity N  Splatter opacity 0-100 (default: 70)
 *   --glow RRGGBB   Neon glow color behind mark (default: 00ff88, "" to disable)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const ROOT = resolve(import.meta.dir, "..");
const MARKS_DIR = join(ROOT, "brand/marks");
const OUT_ROOT = join(ROOT, "brand/embellished/composites");

const SIZE = 1024;

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}
function flagVal(name: string, fallback: number): number {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return Number(args[idx + 1]);
}

const noSplatter = flag("no-splatter");
const noMark = flag("no-mark");
const markScale = flagVal("mark-scale", 60);
const markOpacity = flagVal("mark-opacity", 90);
const splatterOpacity = flagVal("splatter-opacity", 70);
const glowColor = (() => {
  const idx = args.indexOf("--glow");
  if (idx === -1) return "00ff88"; // default brand green
  const val = args[idx + 1];
  return val === "" ? null : val;
})();

const positional = args.filter(
  (a) => !a.startsWith("--") && !args.some((b, i) => b.startsWith("--") && args[i + 1] === a && !a.startsWith("--")),
);
// Simpler: just grab first 3 non-flag args
const pos: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    if (!["--no-splatter", "--no-mark"].includes(args[i])) i++; // skip value
    continue;
  }
  pos.push(args[i]);
}

const [markId, surfacePath, splatterPath] = pos;

if (!markId || !surfacePath) {
  console.error("Usage: bun scripts/composite-mark.ts <mark-id> <surface.png> [splatter.png]");
  console.error("Flags: --no-splatter --no-mark --mark-scale 60 --mark-opacity 90 --splatter-opacity 70");
  process.exit(1);
}

if (!noSplatter && !splatterPath) {
  console.error("Provide a splatter.png path, or use --no-splatter");
  process.exit(1);
}

// ── Load layers ──────────────────────────────────────────────────────────────

// Surface
if (!existsSync(surfacePath)) {
  console.error(`Surface not found: ${surfacePath}`);
  process.exit(1);
}
console.log(`Surface: ${surfacePath}`);
const surface = sharp(surfacePath).resize(SIZE, SIZE, { fit: "cover" });

// Splatter (screen blend: black → transparent)
let splatterLayer: Buffer | undefined;
if (!noSplatter && splatterPath) {
  if (!existsSync(splatterPath)) {
    console.error(`Splatter not found: ${splatterPath}`);
    process.exit(1);
  }
  console.log(`Splatter: ${splatterPath} (opacity: ${splatterOpacity}%)`);

  // Screen blend approximation: use the splatter with reduced opacity
  // Black areas will be nearly invisible, bright areas show through
  const raw = await sharp(splatterPath)
    .resize(SIZE, SIZE, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Convert black-background splatter to transparent-background:
  // For each pixel, alpha = max(r, g, b) * (splatterOpacity / 100)
  const pixels = new Uint8Array(raw);
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    pixels[i + 3] = Math.round(brightness * (splatterOpacity / 100));
  }

  splatterLayer = await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png()
    .toBuffer();
}

// Mark (rasterized SVG) + glow
let markLayer: Buffer | undefined;
let glowLayer: Buffer | undefined;
let haloLayerBuf: Buffer | undefined;
if (!noMark) {
  const svgPath = join(MARKS_DIR, `${markId}-transparent.svg`);
  const svgFallback = join(MARKS_DIR, `${markId}.svg`);
  const svgFile = existsSync(svgPath) ? svgPath : svgFallback;

  if (!existsSync(svgFile)) {
    console.error(`Mark not found: ${svgFile}`);
    process.exit(1);
  }
  console.log(`Mark: ${svgFile} (scale: ${markScale}%, opacity: ${markOpacity}%)`);

  const markSize = Math.round(SIZE * (markScale / 100));
  const svgData = readFileSync(svgFile, "utf-8");
  const resvg = new Resvg(svgData, { fitTo: { mode: "width", value: markSize } });
  const markPng = resvg.render().asPng();

  // Apply opacity to mark
  const markRaw = await sharp(markPng).ensureAlpha().raw().toBuffer();
  const markInfo = await sharp(markPng).metadata();
  const markPixels = new Uint8Array(markRaw);
  for (let i = 0; i < markPixels.length; i += 4) {
    markPixels[i + 3] = Math.round(markPixels[i + 3] * (markOpacity / 100));
  }

  markLayer = await sharp(markPixels, {
    raw: { width: markInfo.width!, height: markInfo.height!, channels: 4 },
  })
    .png()
    .toBuffer();

  // Generate glow layer: dark halo + neon outer glow behind the mark
  if (glowColor) {
    const gr = Number.parseInt(glowColor.slice(0, 2), 16);
    const gg = Number.parseInt(glowColor.slice(2, 4), 16);
    const gb = Number.parseInt(glowColor.slice(4, 6), 16);
    console.log(`Glow: #${glowColor}`);

    // Take the mark alpha channel, blur it heavily for the glow
    // 1) Dark halo (wide, black, kills splatter behind mark)
    const haloBlur = Math.round(markSize * 0.08);
    const halo = await sharp(markPng)
      .resize(markSize, markSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .extractChannel(3) // alpha channel
      .blur(haloBlur > 0 ? haloBlur : 1)
      .toBuffer();
    const haloMeta = await sharp(halo).metadata();
    const haloRaw = await sharp(halo).raw().toBuffer();
    const haloPixels = new Uint8Array(haloRaw.length * 4);
    for (let i = 0; i < haloRaw.length; i++) {
      const a = Math.min(255, haloRaw[i] * 2); // amplify
      haloPixels[i * 4] = 0;
      haloPixels[i * 4 + 1] = 0;
      haloPixels[i * 4 + 2] = 0;
      haloPixels[i * 4 + 3] = Math.round(a * 0.85); // dark halo
    }
    const haloLayer = await sharp(haloPixels, {
      raw: { width: haloMeta.width!, height: haloMeta.height!, channels: 4 },
    })
      .png()
      .toBuffer();

    // 2) Neon glow (medium blur, colored)
    const glowBlur = Math.round(markSize * 0.04);
    const glow = await sharp(markPng)
      .resize(markSize, markSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .extractChannel(3)
      .blur(glowBlur > 0 ? glowBlur : 1)
      .toBuffer();
    const glowMeta = await sharp(glow).metadata();
    const glowRaw = await sharp(glow).raw().toBuffer();
    const glowPixels = new Uint8Array(glowRaw.length * 4);
    for (let i = 0; i < glowRaw.length; i++) {
      const a = Math.min(255, glowRaw[i] * 3); // amplify more
      glowPixels[i * 4] = gr;
      glowPixels[i * 4 + 1] = gg;
      glowPixels[i * 4 + 2] = gb;
      glowPixels[i * 4 + 3] = Math.round(a * 0.6); // neon glow
    }
    glowLayer = await sharp(glowPixels, {
      raw: { width: glowMeta.width!, height: glowMeta.height!, channels: 4 },
    })
      .png()
      .toBuffer();

    // Store halo for compositing
    haloLayerBuf = haloLayer;
  }
}

// ── Composite ────────────────────────────────────────────────────────────────

const layers: sharp.OverlayOptions[] = [];

if (splatterLayer) {
  layers.push({ input: splatterLayer, gravity: "center" });
}

if (haloLayerBuf) {
  layers.push({ input: haloLayerBuf, gravity: "center" });
}

if (glowLayer) {
  layers.push({ input: glowLayer, gravity: "center" });
}

if (markLayer) {
  layers.push({ input: markLayer, gravity: "center" });
}

console.log("Compositing...");
const result = await surface.composite(layers).png().toBuffer();

// ── Save ─────────────────────────────────────────────────────────────────────

const surfaceName = basename(resolve(surfacePath, "../.."));
const splatterName = splatterPath ? basename(resolve(splatterPath, "../..")) : "none";
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const rnd = Math.random().toString(36).slice(2, 6);
const outDir = join(OUT_ROOT, markId, `${surfaceName}_${splatterName}_${ts}_${rnd}`);
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, "composite.png"), result);
writeFileSync(
  join(outDir, "meta.json"),
  JSON.stringify(
    {
      mark: markId,
      surface: surfacePath,
      splatter: splatterPath ?? null,
      mark_scale: markScale,
      mark_opacity: markOpacity,
      splatter_opacity: splatterOpacity,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);

console.log(`\nSaved to ${outDir}/`);
console.log("  composite.png — final layered image");
console.log("  meta.json     — layer sources + settings");

// Open it
const { execSync } = await import("node:child_process");
execSync(`open "${join(outDir, "composite.png")}"`);
