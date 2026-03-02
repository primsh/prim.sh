#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * embellish-contact-sheet.ts — Generate + serve an HTML contact sheet of all brand assets
 *
 * Usage:
 *   bun scripts/embellish-contact-sheet.ts                # generate + open in Chrome
 *   bun scripts/embellish-contact-sheet.ts --serve         # generate + serve on localhost:4444
 *   bun scripts/embellish-contact-sheet.ts --serve --port 5555
 *   bun scripts/embellish-contact-sheet.ts --no-open       # generate only
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const EMBELLISHED = join(ROOT, "brand/embellished");
const OUT = join(EMBELLISHED, "contact-sheet.html");

const args = process.argv.slice(2);
const SERVE = args.includes("--serve");
const NO_OPEN = args.includes("--no-open");
const PORT = (() => {
  const idx = args.indexOf("--port");
  return idx !== -1 ? Number(args[idx + 1]) : 4444;
})();

// ── Types ────────────────────────────────────────────────────────────────────

interface Entry {
  section: "embellished" | "layer" | "composite" | "email";
  category: string; // mark name, surface/splatter type, or composite mark
  dir: string;
  relDir: string;
  imagePath: string; // relative to EMBELLISHED
  footerImagePath?: string; // relative to EMBELLISHED (email pairs only)
  prompt: string;
  model: string;
  timestamp: string;
  tag: string | null;
  extra: Record<string, string>; // additional metadata
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readPrompt(dir: string): string {
  const p = join(dir, "prompt.txt");
  return existsSync(p) ? readFileSync(p, "utf-8").trim() : "(no prompt)";
}

function readMeta(dir: string): Record<string, string> {
  for (const name of ["result-meta.json", "meta.json"]) {
    const p = join(dir, name);
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf-8"));
      } catch {}
    }
  }
  return {};
}

// ── Scan single-shot embellishments ──────────────────────────────────────────

const entries: Entry[] = [];

for (const mark of readdirSync(EMBELLISHED).sort()) {
  if (["layers", "composites"].includes(mark) || mark.endsWith(".html")) continue;
  const markDir = join(EMBELLISHED, mark);
  if (!isDir(markDir)) continue;

  for (const run of readdirSync(markDir).sort()) {
    const runDir = join(markDir, run);
    if (!isDir(runDir)) continue;
    const img = join(runDir, "result.png");
    if (!existsSync(img)) continue;

    const meta = readMeta(runDir);
    entries.push({
      section: "embellished",
      category: mark,
      dir: runDir,
      relDir: relative(ROOT, runDir),
      imagePath: relative(EMBELLISHED, img),
      prompt: readPrompt(runDir),
      model: meta.model ?? "unknown",
      timestamp: meta.timestamp ?? run,
      tag: meta.tag ?? null,
      extra: {},
    });
  }
}

// ── Scan layers (surfaces + splatters) ───────────────────────────────────────

const layersDir = join(EMBELLISHED, "layers");
if (isDir(layersDir)) {
  for (const layerType of ["surfaces", "splatters"]) {
    const typeDir = join(layersDir, layerType);
    if (!isDir(typeDir)) continue;

    for (const name of readdirSync(typeDir).sort()) {
      const nameDir = join(typeDir, name);
      if (!isDir(nameDir)) continue;

      for (const run of readdirSync(nameDir).sort()) {
        const runDir = join(nameDir, run);
        if (!isDir(runDir)) continue;
        const img = join(runDir, "layer.png");
        if (!existsSync(img)) continue;

        const meta = readMeta(runDir);
        entries.push({
          section: "layer",
          category: `${layerType}/${name}`,
          dir: runDir,
          relDir: relative(ROOT, runDir),
          imagePath: relative(EMBELLISHED, img),
          prompt: readPrompt(runDir),
          model: meta.model ?? "unknown",
          timestamp: meta.timestamp ?? run,
          tag: meta.tag ?? null,
          extra: { type: layerType.replace(/s$/, "") },
        });
      }
    }
  }
}

// ── Scan composites ──────────────────────────────────────────────────────────

const compositesDir = join(EMBELLISHED, "composites");
if (isDir(compositesDir)) {
  for (const mark of readdirSync(compositesDir).sort()) {
    const markDir = join(compositesDir, mark);
    if (!isDir(markDir)) continue;

    for (const run of readdirSync(markDir).sort()) {
      const runDir = join(markDir, run);
      if (!isDir(runDir)) continue;
      const img = join(runDir, "composite.png");
      if (!existsSync(img)) continue;

      const meta = readMeta(runDir);
      entries.push({
        section: "composite",
        category: mark,
        dir: runDir,
        relDir: relative(ROOT, runDir),
        imagePath: relative(EMBELLISHED, img),
        prompt: `${meta.surface ?? "?"} + ${meta.splatter ?? "none"}`,
        model: "composite",
        timestamp: meta.timestamp ?? run,
        tag: meta.tag ?? null,
        extra: {
          surface: meta.surface ?? "",
          splatter: meta.splatter ?? "",
          mark_scale: meta.mark_scale ?? "",
          splatter_opacity: meta.splatter_opacity ?? "",
        },
      });
    }
  }
}

// ── Scan email hero pairs ────────────────────────────────────────────────────

const emailDir = join(EMBELLISHED, "email");
if (isDir(emailDir)) {
  for (const emailTag of readdirSync(emailDir).sort()) {
    const tagDir = join(emailDir, emailTag);
    if (!isDir(tagDir)) continue;

    for (const mark of readdirSync(tagDir).sort()) {
      const markDir = join(tagDir, mark);
      if (!isDir(markDir)) continue;

      for (const run of readdirSync(markDir).sort()) {
        const runDir = join(markDir, run);
        if (!isDir(runDir)) continue;
        const heroImg = existsSync(join(runDir, "hero.png")) ? join(runDir, "hero.png") : join(runDir, "hero.jpg");
        if (!existsSync(heroImg)) continue;

        const meta = readMeta(runDir);
        const prompt = readPrompt(runDir);
        // Derive sub-tag from prompt keywords for filtering
        const promptTag = (() => {
          const p = prompt.toLowerCase();
          if (p.includes("laboratory") || p.includes("beaker")) return `${emailTag}/lab`;
          if (p.includes("circuit board")) return `${emailTag}/circuit`;
          if (p.includes("rocket") || p.includes("launchpad")) return `${emailTag}/rocket`;
          if (p.includes("bunker") || p.includes("control room")) return `${emailTag}/bunker`;
          return emailTag;
        })();
        entries.push({
          section: "email",
          category: `${emailTag}/${mark}`,
          dir: runDir,
          relDir: relative(ROOT, runDir),
          imagePath: relative(EMBELLISHED, heroImg),
          prompt,
          model: meta.model ?? "unknown",
          timestamp: meta.timestamp ?? run,
          tag: promptTag,
          extra: { mark: meta.mark ?? mark },
        });
      }
    }
  }
}

// ── Group ────────────────────────────────────────────────────────────────────

const sections: Record<string, Map<string, Entry[]>> = {
  embellished: new Map(),
  layer: new Map(),
  composite: new Map(),
  email: new Map(),
};

for (const e of entries) {
  const map = sections[e.section];
  const key = e.prompt;
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(e);
}

// ── Render section ───────────────────────────────────────────────────────────

function renderSection(title: string, id: string, map: Map<string, Entry[]>): string {
  if (map.size === 0) return "";
  let html = `<section id="${id}" class="section">
  <h2>${esc(title)} <span class="count">(${[...map.values()].reduce((a, g) => a + g.length, 0)})</span></h2>`;

  let idx = 0;
  for (const [prompt, group] of map) {
    html += `
  <div class="prompt-group">
    <div class="prompt-header">${esc(prompt)}</div>
    <div class="grid">`;

    for (const e of group.sort((a, b) => a.category.localeCompare(b.category))) {
      idx++;
      const ts = (() => {
        try {
          return new Date(e.timestamp).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        } catch {
          return e.timestamp;
        }
      })();

      const isEmail = e.section === "email";
      html += `
      <div class="card${isEmail ? " email-card" : ""}" data-tag="${esc(e.tag ?? "")}">
        <img src="${esc(e.imagePath)}" alt="${esc(e.category)} — ${esc(e.prompt)}" loading="lazy" />
        <div class="meta">
          <div class="mark-name">${esc(e.category)}</div>
          <div class="detail"><span class="label">path</span> <code>${esc(e.relDir)}</code></div>
          <div class="detail"><span class="label">model</span> ${esc(e.model)}</div>
          <div class="detail"><span class="label">time</span> ${esc(ts)}</div>${e.tag ? `\n          <div class="detail"><span class="tag-pill">${esc(e.tag)}</span></div>` : ""}`;

      for (const [k, v] of Object.entries(e.extra)) {
        if (v) html += `\n          <div class="detail"><span class="label">${esc(k)}</span> ${esc(v)}</div>`;
      }

      html += `
        </div>
        <div class="vote-btns">
          <button class="btn-keep" title="Keep">&#x2714;</button>
          <button class="btn-nope" title="Nope">&#x2718;</button>
          <button class="btn-finder" title="Open in Finder">&#x1F4C2;</button>
        </div>
      </div>`;
    }

    html += `
    </div>
  </div>`;
  }

  html += `\n</section>`;
  return html;
}

// ── Build HTML ───────────────────────────────────────────────────────────────

const totalCount = entries.length;
const sectionCounts = {
  embellished: [...sections.embellished.values()].reduce((a, g) => a + g.length, 0),
  layer: [...sections.layer.values()].reduce((a, g) => a + g.length, 0),
  composite: [...sections.composite.values()].reduce((a, g) => a + g.length, 0),
  email: [...sections.email.values()].reduce((a, g) => a + g.length, 0),
};

// Collect unique tags
const allTags = [...new Set(entries.map((e) => e.tag).filter(Boolean))] as string[];
allTags.sort();

// Build votes lookup from existing votes.json
const VOTES_PATH = join(EMBELLISHED, "votes.json");
type VoteMap = Record<string, "keep" | "reject">;
const existingVotes: VoteMap = (() => {
  if (existsSync(VOTES_PATH)) {
    try { return JSON.parse(readFileSync(VOTES_PATH, "utf-8")); } catch {}
  }
  return {};
})();

// Build JSON data for client-side use
const entriesJson = JSON.stringify(entries.map(e => ({
  relDir: e.relDir,
  prompt: e.prompt,
  model: e.model,
  tag: e.tag,
  category: e.category,
  section: e.section,
})));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Embellished Marks — Contact Sheet</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a0a; color: #e0e0e0;
    font-family: 'SF Mono', SFMono-Regular, 'Cascadia Code', Consolas, monospace;
    font-size: 12px; padding: 16px;
  }
  h1 { font-size: 16px; color: #00ff88; margin-bottom: 8px; }
  h2 { font-size: 14px; color: #e0e0e0; margin-bottom: 16px; padding-top: 8px; }
  h2 .count { color: #555; font-weight: normal; }
  .stats { color: #666; margin-bottom: 8px; }

  /* Vote summary bar */
  .vote-bar {
    display: flex; gap: 16px; align-items: center;
    padding: 8px 14px; margin-bottom: 16px;
    background: #111; border: 1px solid #222; border-radius: 4px;
    font-size: 12px; color: #666;
  }
  .vote-bar .vb-kept { color: #00ff88; }
  .vote-bar .vb-rejected { color: #ff4444; }
  .vote-bar .vb-unvoted { color: #666; }
  .vote-bar .vb-actions { margin-left: auto; display: flex; gap: 6px; }
  .vote-bar button {
    padding: 4px 12px; border: 1px solid #333; border-radius: 3px;
    background: #0a0a0a; color: #888; font-family: inherit; font-size: 11px;
    cursor: pointer; transition: all 0.15s;
  }
  .vote-bar button:hover { border-color: #444; color: #e0e0e0; }
  .vote-bar button#clear-votes:hover { border-color: #ff4444; color: #ff4444; }
  .vote-bar button#refine-btn { border-color: #4DD0E1; color: #4DD0E1; }
  .vote-bar button#refine-btn:hover { background: #0a1a1a; }
  .vote-bar button#refine-btn:disabled { opacity: 0.3; cursor: default; }
  .vote-bar button#refine-btn.running {
    border-color: #4DD0E1; color: #4DD0E1;
    animation: pulse 1.5s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

  /* Save toast */
  #save-toast {
    position: fixed; bottom: 20px; right: 20px; z-index: 900;
    padding: 6px 14px; background: #001a08; border: 1px solid #00ff88;
    border-radius: 4px; color: #00ff88; font-size: 11px;
    opacity: 0; transform: translateY(8px);
    transition: opacity 0.15s, transform 0.15s;
    pointer-events: none;
  }
  #save-toast.show { opacity: 1; transform: translateY(0); }

  /* Refine status */
  .refine-status {
    display: none; padding: 12px 16px; margin-bottom: 16px;
    background: #111; border: 1px solid #222; border-radius: 4px;
    color: #aaa; font-size: 12px; line-height: 1.8;
  }
  .refine-status.show { display: block; }
  .refine-status .step { color: #666; }
  .refine-status .step.active { color: #4DD0E1; }
  .refine-status .step.done { color: #00ff88; }
  .refine-status .step.done::before { content: "\\2714 "; }
  .refine-status .step.active::before { content: "\\25B6 "; }
  .refine-status .prompt-preview { color: #e0e0e0; padding: 2px 0 2px 16px; }
  .refine-status .reload-btn {
    margin-top: 10px; padding: 8px 20px; border: 1px solid #00ff88;
    border-radius: 3px; background: #001a08; color: #00ff88;
    font-family: inherit; font-size: 12px; cursor: pointer;
  }

  /* Nav tabs */
  nav { display: flex; gap: 4px; margin-bottom: 24px; flex-wrap: wrap; align-items: center; }
  nav a {
    color: #888; text-decoration: none; padding: 6px 14px;
    background: #111; border: 1px solid #222; border-radius: 4px;
    transition: all 0.15s;
  }
  nav a:hover { border-color: #444; color: #e0e0e0; }
  nav a.active { border-color: #00ff88; color: #00ff88; }
  .nav-sep { width: 1px; background: #333; margin: 0 8px; align-self: stretch; min-height: 24px; }
  nav a.tag-filter { border-color: #333; color: #4DD0E1; }
  nav a.tag-filter:hover { border-color: #4DD0E1; }
  nav a.tag-filter.active { border-color: #4DD0E1; color: #0a0a0a; background: #4DD0E1; }
  .tag-pill {
    display: inline-block; padding: 1px 6px; border-radius: 3px;
    font-size: 10px; background: #1a3a3a; color: #4DD0E1; border: 1px solid #2a4a4a;
  }

  /* View toggle */
  .view-toggle { display: flex; gap: 2px; margin-left: auto; }
  .view-toggle a {
    color: #555; text-decoration: none; padding: 6px 10px;
    background: #111; border: 1px solid #222; border-radius: 4px;
    transition: all 0.15s; font-size: 14px; line-height: 1;
  }
  .view-toggle a:hover { border-color: #444; color: #e0e0e0; }
  .view-toggle a.active { border-color: #00ff88; color: #00ff88; }

  .section { display: none; }
  .section.active { display: block; }

  .prompt-group { margin-bottom: 40px; }
  .prompt-header {
    color: #4DD0E1; font-size: 13px; padding: 8px 12px;
    background: #111; border-left: 3px solid #4DD0E1;
    margin-bottom: 16px; line-height: 1.5; word-break: break-word;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }

  /* Card */
  .card {
    background: #111; border: 2px solid #222; border-radius: 6px;
    overflow: hidden; transition: all 0.2s; position: relative;
  }
  .card img {
    width: 100%; aspect-ratio: 1; object-fit: cover;
    display: block; cursor: pointer; transition: opacity 0.2s;
  }
  .email-card > img { aspect-ratio: auto; object-fit: contain; }
  .meta { padding: 10px 12px; }
  .mark-name { color: #00ff88; font-size: 14px; font-weight: bold; margin-bottom: 6px; }
  .detail { color: #888; line-height: 1.8; }
  .label { color: #555; display: inline-block; min-width: 52px; }
  code {
    color: #aaa; font-size: 10px; word-break: break-all;
    background: #1a1a1a; padding: 1px 4px; border-radius: 2px;
  }

  /* Vote buttons */
  .vote-btns {
    display: flex; gap: 0; border-top: 1px solid #1a1a1a;
  }
  .vote-btns button {
    flex: 1; padding: 10px 0; border: none; background: #0a0a0a;
    font-family: inherit; font-size: 16px; cursor: pointer;
    transition: all 0.15s; color: #444; line-height: 1;
  }
  .vote-btns button { border-right: 1px solid #1a1a1a; }
  .vote-btns button:last-child { border-right: none; }
  .vote-btns .btn-keep:hover { background: #001a08; color: #00ff88; }
  .vote-btns .btn-nope:hover { background: #1a0808; color: #ff4444; }
  .vote-btns .btn-finder:hover { background: #0a0a1a; color: #4DD0E1; }

  /* Voted states */
  .card.kept {
    border-color: #00ff88;
    box-shadow: 0 0 12px rgba(0,255,136,0.15), inset 0 0 30px rgba(0,255,136,0.03);
  }
  .card.kept .btn-keep { background: #001a08; color: #00ff88; }
  .card.rejected {
    border-color: #331111;
  }
  .card.rejected img { opacity: 0.25; filter: grayscale(1); }
  .card.rejected .meta { opacity: 0.35; }
  .card.rejected .btn-nope { background: #1a0808; color: #ff4444; }

  /* List view */
  body.list-view .grid { grid-template-columns: 1fr; gap: 2px; }
  body.list-view .card {
    display: grid; grid-template-columns: 56px 1fr auto;
    align-items: center; border-radius: 3px; border-width: 1px;
  }
  body.list-view .card.kept { box-shadow: none; border-color: #00ff88; }
  body.list-view .card img { width: 56px; height: 56px; aspect-ratio: auto; }
  body.list-view .meta {
    display: flex; gap: 16px; align-items: center; padding: 4px 12px; overflow: hidden;
  }
  body.list-view .mark-name { margin-bottom: 0; font-size: 12px; min-width: 70px; }
  body.list-view .detail { font-size: 11px; white-space: nowrap; }
  body.list-view .detail:nth-of-type(n+2) { display: none; }
  body.list-view .vote-btns {
    border-top: none; flex-direction: row; gap: 0;
  }
  body.list-view .vote-btns button { padding: 8px 14px; font-size: 14px; }
  body.list-view .vote-btns button:first-child { border-right: 1px solid #1a1a1a; border-top: none; }
  body.list-view .prompt-header { font-size: 11px; padding: 4px 10px; margin-bottom: 2px; }

  /* Column view */
  body.column-view .grid { grid-template-columns: 1fr; gap: 12px; max-width: 700px; }
  body.column-view .card img { aspect-ratio: auto; object-fit: contain; }

  /* Modal */
  .modal-overlay {
    display: none; position: fixed; inset: 0; z-index: 1100;
    background: rgba(10,10,10,0.85); justify-content: center; align-items: center;
  }
  .modal-overlay.open { display: flex; }
  .modal {
    background: #111; border: 1px solid #333; border-radius: 6px;
    padding: 24px 28px; min-width: 320px; max-width: 420px;
  }
  .modal h3 { color: #e0e0e0; font-size: 14px; margin-bottom: 16px; }
  .modal .modal-options { display: flex; flex-direction: column; gap: 8px; }
  .modal .modal-opt {
    padding: 10px 16px; border: 1px solid #333; border-radius: 4px;
    background: #0a0a0a; color: #e0e0e0; font-family: inherit; font-size: 12px;
    cursor: pointer; transition: all 0.15s; text-align: left;
  }
  .modal .modal-opt:hover { border-color: #4DD0E1; color: #4DD0E1; }
  .modal .modal-opt .opt-count { color: #4DD0E1; font-weight: bold; }
  .modal .modal-cancel {
    margin-top: 12px; padding: 6px 14px; border: 1px solid #333; border-radius: 3px;
    background: transparent; color: #666; font-family: inherit; font-size: 11px;
    cursor: pointer; width: 100%;
  }
  .modal .modal-cancel:hover { color: #888; border-color: #444; }

  /* Lightbox */
  .lightbox {
    display: none; position: fixed; inset: 0; z-index: 1000;
    background: rgba(10,10,10,0.95); justify-content: center; align-items: center;
    cursor: pointer;
  }
  .lightbox.open { display: flex; }
  .lightbox img { max-width: 95vw; max-height: 95vh; object-fit: contain; border-radius: 4px; }
  .lightbox .lb-meta {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: #111; border: 1px solid #333; border-radius: 4px;
    padding: 8px 16px; color: #aaa; font-size: 11px; text-align: center;
    max-width: 90vw; word-break: break-all;
  }

  /* Paths section */
  .paths-section {
    margin-top: 48px; padding-top: 24px; border-top: 1px solid #222;
  }
  .paths-header {
    display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
  }
  .paths-header button {
    padding: 5px 14px; border: 1px solid #333; border-radius: 3px;
    background: #111; color: #888; font-family: inherit; font-size: 11px;
    cursor: pointer; transition: all 0.15s;
  }
  .paths-header button:hover { border-color: #00ff88; color: #00ff88; }
  .paths-header .toast {
    color: #00ff88; font-size: 11px; opacity: 0; transition: opacity 0.2s;
  }
  .paths-header .toast.show { opacity: 1; }
  .paths-list {
    background: #111; border: 1px solid #222; border-radius: 4px;
    padding: 12px 16px; font-size: 11px; line-height: 1.8;
    max-height: 400px; overflow-y: auto; white-space: pre; color: #aaa;
    user-select: all; font-family: inherit;
  }

  @media (max-width: 600px) {
    body { padding: 8px; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
    .meta { padding: 6px 8px; }
    .mark-name { font-size: 12px; }
    .detail { font-size: 10px; line-height: 1.6; }
    nav a { padding: 4px 10px; font-size: 11px; }
    .vote-btns button { padding: 8px 0; font-size: 14px; }
  }
</style>
</head>
<body>
<h1>&gt; brand assets</h1>
<div class="stats">${totalCount} images · generated ${new Date().toISOString().slice(0, 10)}</div>
<div class="vote-bar">
  <span><span class="vb-kept" id="vb-kept">0</span> kept</span>
  <span><span class="vb-rejected" id="vb-rejected">0</span> rejected</span>
  <span><span class="vb-unvoted" id="vb-unvoted">${totalCount}</span> unvoted</span>
  <div class="vb-actions">
    <button id="refine-btn" disabled>refine + regen</button>
    <button id="clear-votes">clear votes</button>
  </div>
</div>
<div class="refine-status" id="refine-status"></div>
<nav>
  <a href="#" data-tab="embellished" class="active">embellished (${sectionCounts.embellished})</a>
  <a href="#" data-tab="layer">layers (${sectionCounts.layer})</a>
  <a href="#" data-tab="composite">composites (${sectionCounts.composite})</a>
  <a href="#" data-tab="email">email heroes (${sectionCounts.email})</a>
  <a href="#" data-tab="all">all (${totalCount})</a>${allTags.length > 0 ? `
  <div class="nav-sep"></div>
  ${allTags.map((t) => `<a href="#" class="tag-filter" data-tag="${esc(t)}">#${esc(t)} (${entries.filter((e) => e.tag === t || e.tag?.startsWith(t + "/")).length})</a>`).join("\n  ")}` : ""}
  <div class="view-toggle">
    <a href="#" data-view="grid" class="active" title="Grid view">&#9638;</a>
    <a href="#" data-view="column" title="Column view">&#9645;</a>
    <a href="#" data-view="list" title="List view">&#9776;</a>
  </div>
</nav>

${renderSection("Embellished Marks", "embellished", sections.embellished)}
${renderSection("Generated Layers", "layer", sections.layer)}
${renderSection("Composites", "composite", sections.composite)}
${renderSection("Email Heroes", "email", sections.email)}

<div class="paths-section">
  <div class="paths-header">
    <h2>paths</h2>
    <button id="copy-all">copy all</button>
    <button id="copy-kept">copy kept</button>
    <span class="toast" id="toast">copied!</span>
  </div>
  <pre class="paths-list" id="paths-list"></pre>
</div>

<div id="save-toast">saved</div>
<div class="lightbox" id="lb">
  <img src="" alt="" />
  <div class="lb-meta"></div>
</div>
<div class="modal-overlay" id="modal-overlay">
  <div class="modal" id="modal"></div>
</div>

<script>
const ENTRIES = ${entriesJson};
const votes = ${JSON.stringify(existingVotes)};

// ── DOM refs ──
const tabs = document.querySelectorAll('nav a[data-tab]');
const tagBtns = document.querySelectorAll('nav a.tag-filter');
const secs = document.querySelectorAll('.section');
const allCards = document.querySelectorAll('.card');
const pathsList = document.getElementById('paths-list');
const toast = document.getElementById('toast');
let activeTags = new Set();

// ── Voting ──
function getPath(card) {
  return card.querySelector('code')?.textContent ?? '';
}

function applyVoteClass(card, vote) {
  card.classList.remove('kept', 'rejected');
  if (vote === 'keep') card.classList.add('kept');
  if (vote === 'reject') card.classList.add('rejected');
}

function saveVote(path, vote) {
  if (votes[path] === vote) {
    delete votes[path]; // toggle off
  } else {
    votes[path] = vote;
  }
  // persist via POST (best-effort, works in --serve mode)
  fetch('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(votes),
  }).then(() => flashSaved()).catch(() => {});
  updateUI();
}

function flashSaved() {
  const el = document.getElementById('save-toast');
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 800);
}

function updateVoteBar() {
  let kept = 0, rejected = 0;
  allCards.forEach(c => {
    if (c.classList.contains('kept')) kept++;
    if (c.classList.contains('rejected')) rejected++;
  });
  document.getElementById('vb-kept').textContent = kept;
  document.getElementById('vb-rejected').textContent = rejected;
  document.getElementById('vb-unvoted').textContent = allCards.length - kept - rejected;
}

function updatePathsList() {
  const kept = [...allCards]
    .filter(c => c.classList.contains('kept'))
    .map(c => getPath(c)).filter(Boolean);
  const visible = [...allCards]
    .filter(c => c.style.display !== 'none' && !c.classList.contains('rejected'))
    .map(c => getPath(c)).filter(Boolean);
  pathsList.textContent = (kept.length > 0 ? kept : visible).join('\\n');
}

function updateUI() {
  allCards.forEach(card => {
    const p = getPath(card);
    applyVoteClass(card, votes[p] ?? null);
  });
  updateVoteBar();
  updatePathsList();
}

// Wire up vote buttons + finder
allCards.forEach(card => {
  const keepBtn = card.querySelector('.btn-keep');
  const nopeBtn = card.querySelector('.btn-nope');
  const finderBtn = card.querySelector('.btn-finder');
  if (keepBtn) keepBtn.addEventListener('click', e => { e.stopPropagation(); saveVote(getPath(card), 'keep'); });
  if (nopeBtn) nopeBtn.addEventListener('click', e => { e.stopPropagation(); saveVote(getPath(card), 'reject'); });
  if (finderBtn) finderBtn.addEventListener('click', e => {
    e.stopPropagation();
    const p = getPath(card);
    fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) }).catch(() => {});
  });
});

// ── Modal helper ──
const modalOverlay = document.getElementById('modal-overlay');
const modalEl = document.getElementById('modal');

function showModal(title, options, onCancel) {
  let h = '<h3>' + title + '</h3><div class="modal-options">';
  options.forEach(function(opt, i) {
    h += '<button class="modal-opt" data-idx="' + i + '">' + opt.label + '</button>';
  });
  h += '</div><button class="modal-cancel">cancel</button>';
  modalEl.innerHTML = h;
  modalOverlay.classList.add('open');

  modalEl.querySelectorAll('.modal-opt').forEach(function(btn) {
    btn.addEventListener('click', function() {
      modalOverlay.classList.remove('open');
      options[Number(btn.dataset.idx)].action();
    });
  });
  modalEl.querySelector('.modal-cancel').addEventListener('click', function() {
    modalOverlay.classList.remove('open');
    if (onCancel) onCancel();
  });
  modalOverlay.addEventListener('click', function(ev) {
    if (ev.target === modalOverlay) { modalOverlay.classList.remove('open'); if (onCancel) onCancel(); }
  }, { once: true });
}

function getFilteredRelDirs() {
  if (activeTags.size === 0) return null; // no filter
  return ENTRIES.filter(function(e) {
    const t = e.tag ?? '';
    for (const f of activeTags) { if (t === f || t.startsWith(f + '/')) return true; }
    return false;
  }).map(function(e) { return e.relDir; });
}

function countVotes(scope) {
  let kept = 0, rejected = 0;
  const dirs = scope === 'filtered' ? getFilteredRelDirs() : null;
  Object.keys(votes).forEach(function(k) {
    if (dirs && !dirs.includes(k)) return;
    if (votes[k] === 'keep') kept++;
    if (votes[k] === 'reject') rejected++;
  });
  return { kept: kept, rejected: rejected, total: kept + rejected };
}

document.getElementById('clear-votes').addEventListener('click', () => {
  const filtered = getFilteredRelDirs();
  const filteredVotes = filtered ? countVotes('filtered') : { total: 0 };
  const allVotes = countVotes('all');

  if (allVotes.total === 0) return;

  // If no filter active or no filtered votes, just clear all
  if (!filtered || filteredVotes.total === 0) {
    Object.keys(votes).forEach(k => delete votes[k]);
    fetch('/api/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(votes) }).catch(() => {});
    updateUI();
    return;
  }

  showModal('Clear votes', [
    {
      label: 'Filtered votes (<span class="opt-count">' + filteredVotes.total + '</span>)',
      action: function() {
        filtered.forEach(function(d) { delete votes[d]; });
        fetch('/api/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(votes) }).catch(() => {});
        updateUI();
      }
    },
    {
      label: 'All votes (<span class="opt-count">' + allVotes.total + '</span>)',
      action: function() {
        Object.keys(votes).forEach(k => delete votes[k]);
        fetch('/api/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(votes) }).catch(() => {});
        updateUI();
      }
    }
  ]);
});

// ── Tag filter ──
function tagMatches(entryTag, filterTag) {
  if (!filterTag) return true;
  return entryTag === filterTag || entryTag.startsWith(filterTag + '/');
}
function cardMatchesTags(card) {
  if (activeTags.size === 0) return true;
  const t = card.getAttribute('data-tag') ?? '';
  for (const f of activeTags) { if (tagMatches(t, f)) return true; }
  return false;
}
function applyTagFilter() {
  tagBtns.forEach(b => b.classList.toggle('active', activeTags.has(b.dataset.tag)));
  allCards.forEach(card => {
    card.style.display = cardMatchesTags(card) ? '' : 'none';
  });
  document.querySelectorAll('.prompt-group').forEach(g => {
    const vis = g.querySelectorAll('.card:not([style*="display: none"])');
    g.style.display = vis.length ? '' : 'none';
  });
  updatePathsList();
}

// ── Tab switching ──
function activate(tab) {
  tabs.forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const id = tab.dataset.tab;
  secs.forEach(s => s.classList.toggle('active', id === 'all' || s.id === id));
}
tabs.forEach(t => t.addEventListener('click', e => {
  e.preventDefault(); activate(t);
  try {
    localStorage.setItem('cs-tab', t.dataset.tab);
    // Clicking a tab clears any active tag filter
    if (activeTags.size) { activeTags.clear(); applyTagFilter(); localStorage.removeItem('cs-tags'); }
  } catch {}
}));
tagBtns.forEach(b => b.addEventListener('click', e => {
  e.preventDefault();
  const tag = b.dataset.tag;
  if (activeTags.has(tag)) { activeTags.delete(tag); } else { activeTags.add(tag); }
  applyTagFilter();
  try {
    if (activeTags.size) localStorage.setItem('cs-tags', JSON.stringify([...activeTags]));
    else localStorage.removeItem('cs-tags');
  } catch {}
}));

const urlTag = new URLSearchParams(location.search).get('tag');
try {
  const savedTab = localStorage.getItem('cs-tab');
  const restoreTab = () => {
    const tb = savedTab ? [...tabs].find(t => t.dataset.tab === savedTab) : null;
    activate(tb || tabs[0]);
  };

  if (urlTag) {
    activeTags.add(urlTag);
    restoreTab();
    applyTagFilter();
  } else {
    const savedTags = localStorage.getItem('cs-tags');
    if (savedTags) {
      for (const t of JSON.parse(savedTags)) activeTags.add(t);
      restoreTab();
      applyTagFilter();
    } else {
      restoreTab();
    }
  }
} catch { activate(tabs[0]); }

// ── View toggle ──
document.querySelectorAll('.view-toggle a').forEach(b => b.addEventListener('click', e => {
  e.preventDefault();
  document.querySelectorAll('.view-toggle a').forEach(v => v.classList.remove('active'));
  b.classList.add('active');
  const view = b.dataset.view;
  document.body.classList.remove('list-view', 'column-view');
  if (view === 'list') document.body.classList.add('list-view');
  if (view === 'column') document.body.classList.add('column-view');
  try { localStorage.setItem('cs-view', view); } catch {}
}));
// Restore saved view
try {
  const saved = localStorage.getItem('cs-view');
  if (saved) {
    const btn = document.querySelector('.view-toggle a[data-view="' + saved + '"]');
    if (btn) { btn.click(); }
  }
} catch {}

// ── Copy paths ──
function flash() {
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1500);
}
document.getElementById('copy-all').addEventListener('click', () => {
  const all = [...allCards].filter(c => c.style.display !== 'none')
    .map(c => getPath(c)).filter(Boolean);
  navigator.clipboard.writeText(all.join('\\n')); flash();
});
document.getElementById('copy-kept').addEventListener('click', () => {
  const kept = [...allCards].filter(c => c.classList.contains('kept'))
    .map(c => getPath(c)).filter(Boolean);
  navigator.clipboard.writeText(kept.join('\\n')); flash();
});

// ── Lightbox ──
const lb = document.getElementById('lb');
const lbImg = lb.querySelector('img');
const lbMeta = lb.querySelector('.lb-meta');
allCards.forEach(card => {
  const img = card.querySelector('img');
  const name = card.querySelector('.mark-name')?.textContent ?? '';
  const path = getPath(card);
  img.addEventListener('click', () => {
    lbImg.src = img.src;
    lbMeta.textContent = name + '  ·  ' + path;
    lb.classList.add('open');
  });
});
lb.addEventListener('click', () => lb.classList.remove('open'));
document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.remove('open'); });

// ── Refine ──
const refineBtn = document.getElementById('refine-btn');
const refineStatus = document.getElementById('refine-status');

function updateRefineBtn() {
  const hasKept = Object.values(votes).some(v => v === 'keep');
  refineBtn.disabled = !hasKept;
}

function startRefine(scope) {
  refineBtn.disabled = true;
  refineBtn.classList.add('running');
  refineBtn.textContent = 'refining...';
  refineStatus.classList.add('show');
  refineStatus.innerHTML = '<div class="step active">Connecting...</div>';

  let url = '/api/refine?scope=' + scope;
  if (scope === 'filtered' && activeTags.size > 0) {
    url += '&tags=' + encodeURIComponent(JSON.stringify([...activeTags]));
  }
  const es = new EventSource(url);
  let html = '';

  es.addEventListener('step', e => {
    const d = JSON.parse(e.data);
    html += '<div class="step done">' + d.msg + '</div>';
    refineStatus.innerHTML = html;
  });

  es.addEventListener('prompts', e => {
    const d = JSON.parse(e.data);
    html += '<div class="step done">Rewrote ' + d.jobs.length + ' prompts:</div>';
    d.jobs.forEach(function(p) {
      html += '<div class="prompt-preview"><span style="color:#666">' + p.mark + ':</span> '
        + '<span style="color:#ff4444;text-decoration:line-through">' + p.original.slice(0, 50) + '</span>'
        + ' &rarr; <span style="color:#00ff88">' + p.rewritten + '</span></div>';
    });
    refineStatus.innerHTML = html;
  });

  es.addEventListener('image_done', e => {
    const d = JSON.parse(e.data);
    html += '<div class="step done">Generated ' + d.index + '/' + d.total + ': ' + d.mark + '</div>';
    refineStatus.innerHTML = html;
  });

  es.addEventListener('image_error', e => {
    const d = JSON.parse(e.data);
    html += '<div class="step" style="color:#ff4444">Failed: ' + d.mark + ' — ' + d.error + '</div>';
    refineStatus.innerHTML = html;
  });

  es.addEventListener('done', e => {
    const d = JSON.parse(e.data);
    html += '<div class="step done">Done! ' + d.imageCount + ' new images ready — see <a href="?tag=' + encodeURIComponent(d.tag) + '" style="color:#4DD0E1;text-decoration:underline;">#' + d.tag + '</a></div>';
    html += '<button class="reload-btn" data-tag="' + d.tag + '">view #' + d.tag + '</button>';
    setTimeout(function() {
      const btn = refineStatus.querySelector('.reload-btn[data-tag]');
      if (btn) btn.addEventListener('click', function() { location.href = '?tag=' + encodeURIComponent(btn.dataset.tag); });
    }, 0);
    refineStatus.innerHTML = html;
    es.close();
    refineBtn.classList.remove('running');
    refineBtn.textContent = 'refine + regen';
    updateRefineBtn();
  });

  es.addEventListener('error', e => {
    try {
      const d = JSON.parse(e.data);
      html += '<div style="color:#ff4444">Error: ' + (d.error || 'unknown') + '</div>';
    } catch {
      html += '<div style="color:#ff4444">Connection lost. Check server logs.</div>';
    }
    refineStatus.innerHTML = html;
    es.close();
    refineBtn.classList.remove('running');
    refineBtn.textContent = 'refine + regen';
    updateRefineBtn();
  });
}

refineBtn.addEventListener('click', () => {
  const filtered = getFilteredRelDirs();
  const fv = filtered ? countVotes('filtered') : { kept: 0, rejected: 0 };
  const av = countVotes('all');

  // If no filter active, go straight to all
  if (!filtered || (fv.kept === 0 && fv.rejected === 0)) {
    startRefine('all');
    return;
  }

  // If filtered and all are the same, go straight
  if (fv.kept === av.kept && fv.rejected === av.rejected) {
    startRefine('all');
    return;
  }

  showModal('Refine scope', [
    {
      label: 'Filtered votes (<span class="opt-count">' + fv.kept + '</span> kept, <span class="opt-count">' + fv.rejected + '</span> rejected)',
      action: function() { startRefine('filtered'); }
    },
    {
      label: 'All votes (<span class="opt-count">' + av.kept + '</span> kept, <span class="opt-count">' + av.rejected + '</span> rejected)',
      action: function() { startRefine('all'); }
    }
  ]);
});

// ── Init ──
// In serve mode, fetch fresh votes from API (baked-in votes may be stale)
fetch('/api/vote').then(r => r.ok ? r.json() : {}).then(fresh => {
  Object.keys(votes).forEach(k => delete votes[k]);
  Object.assign(votes, fresh);
  updateUI();
  updateRefineBtn();
}).catch(() => {
  // Fallback to baked-in votes (static file mode)
  updateUI();
  updateRefineBtn();
});
</script>
</body>
</html>`;

writeFileSync(OUT, html);
console.log(`Contact sheet: ${relative(ROOT, OUT)}`);
console.log(`${totalCount} images (${sectionCounts.embellished} embellished, ${sectionCounts.layer} layers, ${sectionCounts.composite} composites, ${sectionCounts.email} email heroes)`);

// ── Serve mode ───────────────────────────────────────────────────────────────

if (SERVE) {
  const MIME: Record<string, string> = {
    ".html": "text/html",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".txt": "text/plain",
  };

  const server = Bun.serve({
    port: PORT,
    hostname: "0.0.0.0",
    idleTimeout: 255, // max — refine takes 30-90s
    async fetch(req) {
      const url = new URL(req.url);

      // Open in Finder
      if (url.pathname === "/api/open" && req.method === "POST") {
        const { path } = await req.json() as { path: string };
        const abs = join(ROOT, path);
        if (abs.startsWith(ROOT) && existsSync(abs)) {
          const { execSync } = await import("node:child_process");
          execSync(`open "${abs}"`);
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      }

      // Vote API — persist to votes.json
      if (url.pathname === "/api/vote" && req.method === "POST") {
        const body = await req.json();
        writeFileSync(VOTES_PATH, JSON.stringify(body, null, 2) + "\n");
        const kept = Object.values(body).filter(v => v === "keep").length;
        const rejected = Object.values(body).filter(v => v === "reject").length;
        console.log(`Votes saved: ${kept} kept, ${rejected} rejected`);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Refine API — SSE stream: analyze votes, rewrite prompts, generate images
      if (url.pathname === "/api/refine" && req.method === "GET") {
        const stream = new ReadableStream({
          async start(ctrl) {
            const send = (event: string, data: unknown) => {
              ctrl.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            try {
              const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
              if (!apiKey) { send("error", { error: "GEMINI_API_KEY not set" }); ctrl.close(); return; }

              const freshVotes: VoteMap = existsSync(VOTES_PATH)
                ? JSON.parse(readFileSync(VOTES_PATH, "utf-8")) : {};

              // Scope filtering — only use votes matching active tags
              const scope = url.searchParams.get("scope") ?? "all";
              const tagsParam = url.searchParams.get("tags");
              const filterTags: string[] = tagsParam ? JSON.parse(tagsParam) : [];

              const scopedEntries = scope === "filtered" && filterTags.length > 0
                ? entries.filter(e => {
                    const t = e.tag ?? "";
                    return filterTags.some(f => t === f || t.startsWith(f + "/"));
                  })
                : entries;

              const kept = scopedEntries.filter(e => freshVotes[e.relDir] === "keep");
              const rejected = scopedEntries.filter(e => freshVotes[e.relDir] === "reject");

              if (kept.length === 0) { send("error", { error: "No kept images to learn from" }); ctrl.close(); return; }
              if (rejected.length === 0) { send("error", { error: "No rejected images to retry" }); ctrl.close(); return; }

              const keptPrompts = [...new Set(kept.map(e => e.prompt))];
              // Include both embellished and email sections in refinement
              const rejectEntries = rejected.filter(e => e.section === "embellished" || e.section === "email");
              const rejectedPrompts = [...new Set(rejectEntries.map(e => e.prompt))];
              const hasEmail = rejectEntries.some(e => e.section === "email");
              const hasEmbellished = rejectEntries.some(e => e.section === "embellished");

              send("step", { msg: `Analyzing ${kept.length} liked, ${rejectEntries.length} rejected${hasEmail ? " (incl. email heroes)" : ""}...` });

              // Gemini text — rewrite rejected prompts
              const textModel = "gemini-2.5-flash";
              const textUrl = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent`;

              const analysisPrompt = [
                "You are a creative director for AI-generated brand assets.",
                "We use Gemini image-to-image to embellish geometric logo marks (the green chevron > mark for prim.sh).",
                "",
                "STEP 1: Analyze what makes the LIKED prompts work that the REJECTED ones lack.",
                "Think about: physicality, drama, energy, sensory details, lighting, mood, specificity, action verbs.",
                "",
                "LIKED (the user chose these — figure out WHY they work):",
                ...keptPrompts.map(p => `  + "${p}"`),
                "",
                "REJECTED (the concepts are good but something about the execution fell flat):",
                ...rejectedPrompts.map((p, i) => `  ${i + 1}. "${p}"`),
                "",
                "STEP 2: For each rejected prompt, rewrite it by:",
                "1. KEEPING the core subject (eggshell, wall, mission control, etc.)",
                "2. Transferring the specific QUALITIES that made the liked prompts succeed",
                "3. Making a BOLD creative leap — don't just add keywords from liked prompts, reimagine the scene",
                "4. Adding visceral, physical details (not abstract descriptors)",
                "5. Each prompt should be 15-30 words, starting with an action/scene description",
                "",
                "IMPORTANT: Do NOT just shuffle words or add 'smoke and steam' to everything.",
                "Each rewrite must feel like a meaningfully different creative direction for the same subject.",
                "",
                `Return exactly ${rejectedPrompts.length} rewritten prompts, one per line, in the same order.`,
                "No numbering, no quotes, no explanation.",
              ].join("\\n");

              send("step", { msg: "Asking Gemini to rewrite prompts..." });

              const textRes = await fetch(`${textUrl}?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: analysisPrompt }] }],
                  generationConfig: { temperature: 0.9 },
                }),
              });

              if (!textRes.ok) {
                send("error", { error: `Gemini text API error (${textRes.status})` });
                ctrl.close(); return;
              }

              const textData = await textRes.json();
              const responseText = textData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
              const rewrittenPrompts = responseText
                .split("\n").map((l: string) => l.trim())
                .filter((l: string) => l.length > 5 && !l.startsWith("#"));

              if (rewrittenPrompts.length === 0) {
                send("error", { error: "No prompts generated" }); ctrl.close(); return;
              }

              // Map rewritten prompts to retry jobs
              const retryJobs: { mark: string; prompt: string; originalPrompt: string; section: string; emailTag?: string }[] = [];
              for (let i = 0; i < rejectedPrompts.length && i < rewrittenPrompts.length; i++) {
                const originalPrompt = rejectedPrompts[i];
                const newPrompt = rewrittenPrompts[i];
                const matching = rejectEntries.filter(e => e.prompt === originalPrompt);
                const marks = [...new Set(matching.map(e => e.section === "email" ? e.category.split("/")[1] ?? "chevron" : e.category))];
                const section = matching[0]?.section ?? "embellished";
                const emailTag = section === "email" ? matching[0]?.tag?.split("/")[0] ?? "beta" : undefined;
                for (const m of marks) retryJobs.push({ mark: m, prompt: newPrompt, originalPrompt, section, emailTag });
              }

              send("prompts", {
                jobs: retryJobs.map(j => ({ mark: j.mark, original: j.originalPrompt, rewritten: j.prompt })),
              });

              // Determine tag
              const existingRefined = allTags.filter(t => t.startsWith("refined"));
              const round = existingRefined.length + 1;
              const tag = `refined-v${round}`;

              // Build refine log
              const refineLog: Record<string, unknown> = {
                tag,
                timestamp: new Date().toISOString(),
                votes_snapshot: freshVotes,
                kept_prompts: keptPrompts,
                rejected_prompts: rejectedPrompts,
                gemini_text_model: textModel,
                gemini_text_prompt: analysisPrompt,
                gemini_text_response: responseText,
                rewritten_prompts: rewrittenPrompts,
                retry_jobs: retryJobs.map(j => ({ mark: j.mark, original: j.originalPrompt, rewritten: j.prompt })),
                results: [] as { mark: string; prompt: string; ok: boolean; error?: string }[],
              };

              // Generate images one at a time, streaming progress
              const embellishScript = join(ROOT, "scripts/embellish-mark.ts");
              const emailHeroScript = join(ROOT, "scripts/gen-email-heroes.ts");
              let imageCount = 0;

              for (let i = 0; i < retryJobs.length; i++) {
                const job = retryJobs[i];
                const isEmail = job.section === "email";
                send("step", { msg: `Generating ${i + 1}/${retryJobs.length}: ${job.mark}${isEmail ? " (email hero)" : ""}...` });
                console.log(`  Generating${isEmail ? " (email)" : ""}: ${job.mark} + "${job.prompt}"`);

                // Email heroes use gen-email-heroes.ts with --count 1, embellished use embellish-mark.ts
                const cmd = isEmail
                  ? ["bun", emailHeroScript, job.emailTag ?? "beta", "--count", "1", "--mark", job.mark, "--prompt", job.prompt]
                  : ["bun", embellishScript, "--tag", tag, job.mark, job.prompt];

                const proc = Bun.spawn(cmd, {
                  cwd: ROOT, env: process.env, stdout: "pipe", stderr: "pipe",
                });
                const exitCode = await proc.exited;
                if (exitCode === 0) {
                  imageCount++;
                  (refineLog.results as unknown[]).push({ mark: job.mark, prompt: job.prompt, section: job.section, ok: true });
                  send("image_done", { mark: job.mark, index: i + 1, total: retryJobs.length });
                } else {
                  const stderr = await new Response(proc.stderr).text();
                  (refineLog.results as unknown[]).push({ mark: job.mark, prompt: job.prompt, section: job.section, ok: false, error: stderr.slice(0, 500) });
                  send("image_error", { mark: job.mark, error: stderr.slice(0, 200) });
                }
              }

              refineLog.image_count = imageCount;

              // Save refine log
              const logDir = join(EMBELLISHED, "refine-logs");
              mkdirSync(logDir, { recursive: true });
              const logPath = join(logDir, `${tag}.json`);
              writeFileSync(logPath, JSON.stringify(refineLog, null, 2) + "\n");
              console.log(`Refine log saved: ${logPath}`);

              // Regen HTML
              send("step", { msg: "Regenerating contact sheet..." });
              const regenProc = Bun.spawn(["bun", join(ROOT, "scripts/embellish-contact-sheet.ts"), "--no-open"], {
                cwd: ROOT, env: process.env, stdout: "pipe", stderr: "pipe",
              });
              await regenProc.exited;

              send("done", { tag, imageCount, keptCount: kept.length, rejectedCount: rejectEntries.length });
              ctrl.close();
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error(`Refine error: ${msg}`);
              send("error", { error: msg });
              ctrl.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      }

      // Vote API — read current votes
      if (url.pathname === "/api/vote" && req.method === "GET") {
        if (existsSync(VOTES_PATH)) {
          return new Response(Bun.file(VOTES_PATH), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { headers: { "Content-Type": "application/json" } });
      }

      let path = decodeURIComponent(url.pathname);
      if (path === "/") path = "/contact-sheet.html";

      const filePath = join(EMBELLISHED, path);
      if (!existsSync(filePath) || !filePath.startsWith(EMBELLISHED)) {
        return new Response("Not found", { status: 404 });
      }

      const ext = extname(filePath);
      const contentType = MIME[ext] ?? "application/octet-stream";
      return new Response(Bun.file(filePath), {
        headers: { "Content-Type": contentType, "Cache-Control": "no-cache" },
      });
    },
  });

  console.log(`\nServing on:`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  http://garrics-mac-mini.tail3fc2fd.ts.net:${PORT}  (tailscale)`);
  console.log(`\nCtrl+C to stop`);
} else if (!NO_OPEN) {
  const { execSync } = await import("node:child_process");
  execSync(`open -a "Google Chrome" "${OUT}"`);
}
