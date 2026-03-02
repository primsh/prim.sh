#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-email-heroes.ts — Generate cohesive hero + footer banner pairs for emails
 *
 * Generates ONE tall image (1200×700) via Gemini, then slices into:
 *   - Hero (top 500px) → 600px wide JPEG
 *   - Footer (bottom 150px) → 600px wide JPEG
 *
 * Usage:
 *   GEMINI_API_KEY=... bun scripts/gen-email-heroes.ts beta              # 3 pairs
 *   GEMINI_API_KEY=... bun scripts/gen-email-heroes.ts beta --count 5    # 5 pairs
 *   GEMINI_API_KEY=... bun scripts/gen-email-heroes.ts beta --pro        # pro model
 *   GEMINI_API_KEY=... bun scripts/gen-email-heroes.ts beta --mark bang  # specific mark
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { parse as parseYaml } from "yaml";
import { GEMINI_MODELS, callGeminiImageToImage } from "./lib/gemini.ts";
import type { GeminiModel } from "./lib/gemini.ts";

const ROOT = resolve(import.meta.dir, "..");
const THEMES_PATH = join(ROOT, "docs/email-themes.yaml");
const MARKS_DIR = join(ROOT, "brand/marks");
const OUT_ROOT = join(ROOT, "brand/embellished/email");

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const usePro = args.includes("--pro");
const count = (() => {
  const idx = args.indexOf("--count");
  return idx !== -1 ? Number(args[idx + 1]) : 3;
})();
const markOverride = (() => {
  const idx = args.indexOf("--mark");
  return idx !== -1 ? args[idx + 1] : null;
})();
const promptOverride = (() => {
  const idx = args.indexOf("--prompt");
  return idx !== -1 ? args[idx + 1] : null;
})();
const tag = args.filter((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"))[0];

if (!tag) {
  console.error("Usage: bun scripts/gen-email-heroes.ts <tag> [--count N] [--pro] [--mark <mark>] [--prompt <prompt>]");
  console.error("Tags: beta, launch, announcement, legal");
  process.exit(1);
}

// ── Load theme ───────────────────────────────────────────────────────────────

interface ThemeConfig {
  [tag: string]: { prompts: string[] };
}

if (!existsSync(THEMES_PATH)) {
  console.error(`Theme file not found: ${THEMES_PATH}`);
  process.exit(1);
}

const themes = parseYaml(readFileSync(THEMES_PATH, "utf-8")) as ThemeConfig;
const theme = themes[tag];
if (!theme) {
  console.error(`Unknown tag "${tag}". Available: ${Object.keys(themes).join(", ")}`);
  process.exit(1);
}

// ── Resolve mark ─────────────────────────────────────────────────────────────

const markId = markOverride ?? "chevron";
const svgPath = join(MARKS_DIR, `${markId}.svg`);
if (!existsSync(svgPath)) {
  console.error(`Mark not found: ${svgPath}`);
  process.exit(1);
}

const model: GeminiModel = usePro ? "pro" : "flash";

console.log(`Tag: ${tag}`);
console.log(`Mark: ${markId}`);
console.log(`Model: ${GEMINI_MODELS[model]}`);
console.log(`Count: ${count}`);
console.log();

// ── Rasterize mark onto tall canvas ──────────────────────────────────────────

const svgData = readFileSync(svgPath, "utf-8");
const markPng = Buffer.from(
  new Resvg(svgData, {
    fitTo: { mode: "height", value: 400 },
    background: "rgba(0,0,0,0)",
  }).render().asPng(),
);

// Compose mark centered on 1200×700 dark canvas
const canvas = await sharp({
  create: { width: 1200, height: 700, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } },
})
  .composite([{ input: markPng, gravity: "center" }])
  .png()
  .toBuffer();

console.log("Canvas: 1200×700 with centered mark");

// ── Generate ─────────────────────────────────────────────────────────────────

let success = 0;
let fail = 0;

for (let i = 0; i < count; i++) {
  const promptIdx = Math.floor(Math.random() * theme.prompts.length);
  const prompt = promptOverride ?? theme.prompts[promptIdx];
  const fullPrompt = `Edit this image into a wide cinematic scene: ${prompt}. Fill the full panoramic frame. Maintain the green mark shape.`;

  console.log(`\n[${i + 1}/${count}] ${prompt.slice(0, 80)}...`);

  try {
    const resultPng = await callGeminiImageToImage(canvas, fullPrompt, { model });

    // Get result dimensions
    const meta = await sharp(resultPng).metadata();
    const w = meta.width ?? 1200;
    const h = meta.height ?? 700;

    // Slice hero: center band (trim equal amounts from top and bottom)
    const heroH = Math.round((500 / 700) * h);
    const trim = Math.round((h - heroH) / 2);
    const hero = await sharp(resultPng)
      .extract({ left: 0, top: trim, width: w, height: heroH })
      .png()
      .toBuffer();

    // Slice footer: bottom strip from full result
    const footerH = Math.round((150 / 700) * h);
    const footer = await sharp(resultPng)
      .extract({ left: 0, top: h - footerH, width: w, height: footerH })
      .png()
      .toBuffer();

    // Save
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const rnd = Math.random().toString(36).slice(2, 6);
    const outDir = join(OUT_ROOT, tag, markId, `${ts}_${rnd}`);
    mkdirSync(outDir, { recursive: true });

    writeFileSync(join(outDir, "source.png"), canvas);
    writeFileSync(join(outDir, "result.png"), resultPng);
    writeFileSync(join(outDir, "hero.png"), hero);
    writeFileSync(join(outDir, "footer.png"), footer);
    writeFileSync(join(outDir, "prompt.txt"), prompt);
    writeFileSync(
      join(outDir, "result-meta.json"),
      JSON.stringify(
        {
          model: GEMINI_MODELS[model],
          tag,
          mark: markId,
          full_prompt: fullPrompt,
          timestamp: new Date().toISOString(),
          result_dimensions: { width: w, height: h },
          hero_dimensions: { width: w, height: heroH },
          trim_px: trim,
        },
        null,
        2,
      ) + "\n",
    );

    const heroMeta = await sharp(hero).metadata();
    console.log(`  hero.png: ${heroMeta.width}×${heroMeta.height} (trimmed ${trim}px top+bottom)`);
    console.log(`  Saved: ${outDir}`);
    success++;
  } catch (err) {
    console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
    fail++;
  }
}

console.log(`\nDone: ${success} generated, ${fail} failed`);
console.log(`Output: brand/embellished/email/${tag}/${markId}/`);
