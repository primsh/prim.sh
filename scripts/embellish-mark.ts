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

const ROOT = resolve(import.meta.dir, "..");
const MARKS_DIR = join(ROOT, "brand/marks");
const OUT_ROOT = join(ROOT, "brand/embellished");

const MODELS = {
  flash: "gemini-3.1-flash-image-preview",
  pro: "gemini-3-pro-image-preview",
} as const;

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const usePro = args.includes("--pro");
const positional = args.filter((a) => a !== "--pro");
const [markId, ...promptParts] = positional;
const prompt = promptParts.join(" ");

const GEMINI_MODEL = usePro ? MODELS.pro : MODELS.flash;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!markId || !prompt) {
  console.error("Usage: bun scripts/embellish-mark.ts <mark-id> <prompt>");
  console.error('Example: bun scripts/embellish-mark.ts chevron "spray paint graffiti, neon green glow"');
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error("Set GEMINI_API_KEY or GOOGLE_API_KEY");
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
const sourcePng = resvg.render().asPng();
const base64Png = Buffer.from(sourcePng).toString("base64");

// ── Call Gemini ──────────────────────────────────────────────────────────────

const fullPrompt = `Edit this image: ${prompt}. Maintain the exact shape and proportions of the green chevron mark.`;

console.log(`Calling ${GEMINI_MODEL}...`);
console.log(`Prompt: ${fullPrompt}`);

const body = {
  contents: [
    {
      parts: [
        { inlineData: { mimeType: "image/png", data: base64Png } },
        { text: fullPrompt },
      ],
    },
  ],
  generationConfig: {
    responseModalities: ["TEXT", "IMAGE"],
  },
};

const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const err = await res.text();
  console.error(`Gemini API error (${res.status}): ${err}`);
  process.exit(1);
}

const data = await res.json();

// ── Parse response ───────────────────────────────────────────────────────────

const parts = data.candidates?.[0]?.content?.parts;
if (!parts || parts.length === 0) {
  console.error("No parts in Gemini response");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

const imagePart = parts.find(
  (p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/"),
);
if (!imagePart) {
  console.error("No image in Gemini response. Parts:");
  for (const p of parts) {
    if (p.text) console.error(`  text: ${p.text.slice(0, 200)}`);
    else console.error(`  ${JSON.stringify(Object.keys(p))}`);
  }
  process.exit(1);
}

const resultPng = Buffer.from(imagePart.inlineData.data, "base64");

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
