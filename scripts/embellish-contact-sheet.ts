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

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
  section: "embellished" | "layer" | "composite";
  category: string; // mark name, surface/splatter type, or composite mark
  dir: string;
  relDir: string;
  imagePath: string; // relative to EMBELLISHED
  prompt: string;
  model: string;
  timestamp: string;
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

// ── Group ────────────────────────────────────────────────────────────────────

const sections: Record<string, Map<string, Entry[]>> = {
  embellished: new Map(),
  layer: new Map(),
  composite: new Map(),
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

      html += `
      <div class="card">
        <img src="${esc(e.imagePath)}" alt="${esc(e.category)} — ${esc(e.prompt)}" loading="lazy" />
        <div class="meta">
          <div class="mark-name">${esc(e.category)}</div>
          <div class="detail"><span class="label">path</span> <code>${esc(e.relDir)}</code></div>
          <div class="detail"><span class="label">model</span> ${esc(e.model)}</div>
          <div class="detail"><span class="label">time</span> ${esc(ts)}</div>`;

      for (const [k, v] of Object.entries(e.extra)) {
        if (v) html += `\n          <div class="detail"><span class="label">${esc(k)}</span> ${esc(v)}</div>`;
      }

      html += `
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
};

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
  .stats { color: #666; margin-bottom: 16px; }

  /* Nav tabs */
  nav { display: flex; gap: 4px; margin-bottom: 24px; flex-wrap: wrap; }
  nav a {
    color: #888; text-decoration: none; padding: 6px 14px;
    background: #111; border: 1px solid #222; border-radius: 4px;
    transition: all 0.15s;
  }
  nav a:hover { border-color: #444; color: #e0e0e0; }
  nav a.active { border-color: #00ff88; color: #00ff88; }

  .section { display: none; }
  .section.active { display: block; }

  .prompt-group { margin-bottom: 40px; }
  .prompt-header {
    color: #4DD0E1; font-size: 13px; padding: 8px 12px;
    background: #111; border-left: 3px solid #4DD0E1;
    margin-bottom: 16px; line-height: 1.5;
    word-break: break-word;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  .card {
    background: #111; border: 1px solid #222; border-radius: 4px;
    overflow: hidden; transition: border-color 0.15s;
  }
  .card:hover { border-color: #00ff88; }
  .card img {
    width: 100%; aspect-ratio: 1; object-fit: cover;
    display: block; cursor: pointer;
  }
  .meta { padding: 10px 12px; }
  .mark-name { color: #00ff88; font-size: 14px; font-weight: bold; margin-bottom: 6px; }
  .detail { color: #888; line-height: 1.8; }
  .label { color: #555; display: inline-block; min-width: 52px; }
  code {
    color: #aaa; font-size: 10px; word-break: break-all;
    background: #1a1a1a; padding: 1px 4px; border-radius: 2px;
  }

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

  @media (max-width: 600px) {
    body { padding: 8px; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
    .meta { padding: 6px 8px; }
    .mark-name { font-size: 12px; }
    .detail { font-size: 10px; line-height: 1.6; }
    nav a { padding: 4px 10px; font-size: 11px; }
  }
</style>
</head>
<body>
<h1>&gt; brand assets</h1>
<div class="stats">${totalCount} images · generated ${new Date().toISOString().slice(0, 10)}</div>
<nav>
  <a href="#" data-tab="embellished" class="active">embellished (${sectionCounts.embellished})</a>
  <a href="#" data-tab="layer">layers (${sectionCounts.layer})</a>
  <a href="#" data-tab="composite">composites (${sectionCounts.composite})</a>
  <a href="#" data-tab="all">all (${totalCount})</a>
</nav>

${renderSection("Embellished Marks", "embellished", sections.embellished)}
${renderSection("Generated Layers", "layer", sections.layer)}
${renderSection("Composites", "composite", sections.composite)}

<div class="lightbox" id="lb">
  <img src="" alt="" />
  <div class="lb-meta"></div>
</div>

<script>
// Tab switching
const tabs = document.querySelectorAll('nav a');
const secs = document.querySelectorAll('.section');
function activate(tab) {
  tabs.forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const id = tab.dataset.tab;
  secs.forEach(s => {
    s.classList.toggle('active', id === 'all' || s.id === id);
  });
}
tabs.forEach(t => t.addEventListener('click', e => { e.preventDefault(); activate(t); }));
// Default
activate(tabs[0]);

// Lightbox
const lb = document.getElementById('lb');
const lbImg = lb.querySelector('img');
const lbMeta = lb.querySelector('.lb-meta');
document.querySelectorAll('.card').forEach(card => {
  const img = card.querySelector('img');
  const name = card.querySelector('.mark-name')?.textContent ?? '';
  const path = card.querySelector('code')?.textContent ?? '';
  img.addEventListener('click', () => {
    lbImg.src = img.src;
    lbMeta.textContent = name + '  ·  ' + path;
    lb.classList.add('open');
  });
});
lb.addEventListener('click', () => lb.classList.remove('open'));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') lb.classList.remove('open');
});
</script>
</body>
</html>`;

writeFileSync(OUT, html);
console.log(`Contact sheet: ${relative(ROOT, OUT)}`);
console.log(`${totalCount} images (${sectionCounts.embellished} embellished, ${sectionCounts.layer} layers, ${sectionCounts.composite} composites)`);

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
    fetch(req) {
      const url = new URL(req.url);
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
