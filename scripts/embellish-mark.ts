#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * embellish-mark.ts — Gemini image-to-image experiment
 *
 * Feeds a code-gen mark PNG + style prompt into Gemini to produce
 * embellished (spray-paint / graffiti / etc.) versions.
 *
 * Usage:
 *   GEMINI_API_KEY=... bun scripts/embellish-mark.ts chevron "spray paint graffiti on concrete wall, neon green glow"
 *   GEMINI_API_KEY=... bun scripts/embellish-mark.ts --pro chevron "spray paint graffiti"   # use pro model
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { GEMINI_MODELS, callGeminiImageToImage } from "./lib/gemini.ts";
import type { GeminiModel } from "./lib/gemini.ts";

const ROOT = resolve(import.meta.dir, "..");
const MARKS_DIR = join(ROOT, "brand/marks");
const OUT_ROOT = join(ROOT, "brand/embellished");

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const usePro = args.includes("--pro");
const tag = (() => {
  const idx = args.indexOf("--tag");
  return idx !== -1 ? args[idx + 1] : null;
})();
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--tag"));
const [markId, ...promptParts] = positional;
const prompt = promptParts.join(" ");

const model: GeminiModel = usePro ? "pro" : "flash";
const GEMINI_MODEL = GEMINI_MODELS[model];

if (!markId || !prompt) {
  console.error("Usage: bun scripts/embellish-mark.ts <mark-id> <prompt>");
  console.error('Example: bun scripts/embellish-mark.ts chevron "spray paint graffiti, neon green glow"');
  process.exit(1);
}

// ── Rasterize SVG → 1024×1024 PNG ───────────────────────────────────────────

const svgPath = join(MARKS_DIR, `${markId}.svg`);
if (!existsSync(svgPath)) {
  console.error(`Mark not found: ${svgPath}`);
  process.exit(1);
}

console.log(`Rasterizing ${svgPath} → 1024×1024 PNG`);
const svgData = readFileSync(svgPath, "utf-8");
const resvg = new Resvg(svgData, {
  fitTo: { mode: "width", value: 1024 },
  background: "#0a0a0a",
});
const sourcePng = Buffer.from(resvg.render().asPng());

// ── Call Gemini ──────────────────────────────────────────────────────────────

const fullPrompt = `Edit this image: ${prompt}. Maintain the exact shape and proportions of the green chevron mark.`;

console.log(`Calling ${GEMINI_MODEL}...`);
console.log(`Prompt: ${fullPrompt}`);

const resultPng = await callGeminiImageToImage(sourcePng, fullPrompt, { model });

// ── Save outputs ─────────────────────────────────────────────────────────────

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const rnd = Math.random().toString(36).slice(2, 6);
const outDir = join(OUT_ROOT, markId, `${ts}_${rnd}`);
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, "source.png"), sourcePng);
writeFileSync(join(outDir, "result.png"), resultPng);
writeFileSync(join(outDir, "prompt.txt"), prompt);
writeFileSync(
  join(outDir, "result-meta.json"),
  JSON.stringify(
    {
      model: GEMINI_MODEL,
      full_prompt: fullPrompt,
      timestamp: new Date().toISOString(),
      generation_config: { responseModalities: ["TEXT", "IMAGE"] },
      ...(tag ? { tag } : {}),
    },
    null,
    2,
  ) + "\n",
);

console.log(`\nSaved to ${outDir}/`);
console.log("  source.png       — rasterized input");
console.log("  result.png       — Gemini output");
console.log("  prompt.txt       — exact prompt used");
console.log("  result-meta.json — model + timestamp");
