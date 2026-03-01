#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * gen-layer.ts — Generate background surfaces and splatter layers via Gemini
 *
 * Usage:
 *   bun scripts/gen-layer.ts surface concrete-wall "rough concrete wall, urban, weathered, cracks, dark moody lighting"
 *   bun scripts/gen-layer.ts splatter galaxy "spray paint splatter on pure black background, galaxy nebula colors, neon green cyan purple pink"
 *   bun scripts/gen-layer.ts splatter pollock --pro "jackson pollock style paint splatter on pure black, neon drips"
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUT_ROOT = join(ROOT, "brand/embellished/layers");

const MODELS = {
  flash: "gemini-3.1-flash-image-preview",
  pro: "gemini-3-pro-image-preview",
} as const;

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const usePro = args.includes("--pro");
const positional = args.filter((a) => a !== "--pro");
const [type, name, ...promptParts] = positional;
const prompt = promptParts.join(" ");

if (!type || !name || !prompt || !["surface", "splatter"].includes(type)) {
  console.error("Usage: bun scripts/gen-layer.ts <surface|splatter> <name> <prompt>");
  console.error('Example: bun scripts/gen-layer.ts surface concrete-wall "rough concrete wall, dark moody"');
  console.error('Example: bun scripts/gen-layer.ts splatter galaxy "spray paint splatter, galaxy nebula colors"');
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error("Set GEMINI_API_KEY or GOOGLE_API_KEY");
  process.exit(1);
}

const GEMINI_MODEL = usePro ? MODELS.pro : MODELS.flash;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ── Prompt construction ──────────────────────────────────────────────────────

const systemPrompts: Record<string, string> = {
  surface: `Generate a 1024x1024 background texture image: ${prompt}. This will be used as a background surface. No text, no symbols, no marks — just the surface texture filling the entire frame. Dark and moody overall tone.`,
  splatter: `Generate a 1024x1024 image on a pure black (#0a0a0a) background: ${prompt}. This is a splatter/spray paint overlay layer. The black background must remain pure black so it can be composited. Bright neon colors only — greens, cyans, purples, pinks, oranges. No text, no symbols, no recognizable shapes — just abstract paint splatter and spray.`,
};

const fullPrompt = systemPrompts[type];

// ── Call Gemini (text-to-image, no input image) ──────────────────────────────

console.log(`Generating ${type}: ${name}`);
console.log(`Model: ${GEMINI_MODEL}`);
console.log(`Prompt: ${fullPrompt}`);

const body = {
  contents: [{ parts: [{ text: fullPrompt }] }],
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

// ── Save ─────────────────────────────────────────────────────────────────────

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(OUT_ROOT, `${type}s`, name, ts);
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, "layer.png"), resultPng);
writeFileSync(join(outDir, "prompt.txt"), prompt);
writeFileSync(
  join(outDir, "meta.json"),
  JSON.stringify(
    {
      type,
      name,
      model: GEMINI_MODEL,
      full_prompt: fullPrompt,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);

console.log(`\nSaved to ${outDir}/`);
console.log("  layer.png  — generated image");
console.log("  prompt.txt — user prompt");
console.log("  meta.json  — model + full prompt");
