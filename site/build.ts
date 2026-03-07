// site/build.ts — Build static dist from site/ with template substitution
// Usage: bun run site/build.ts
// Output: site-dist/ (index.html + prim subpages rendered from prim.yaml)
//
// Cards in index.html are managed by gen-prims.ts (source of truth).
// This script only does brand copy substitution and prim subpage rendering.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { BRAND } from "./brand.ts";
import {
  type LegalConfig,
  type PrimConfig,
  render,
  renderFooter,
  renderLegal,
  setBuildHash,
} from "./template.ts";

// Set cache-bust hash for template CSS references
const buildHash = process.env.GITHUB_SHA?.slice(0, 8) ?? Date.now().toString(36);
setBuildHash(buildHash);

const ROOT = resolve(import.meta.dir, "..");

// ── index.html ───────────────────────────────────────────────────────────────

const src = readFileSync(resolve(ROOT, "site/index.html"), "utf-8");
const out = src
  .replace("{{nounStyled}}", BRAND.nounStyled)
  .replace("{{tagline}}", BRAND.tagline)
  .replace("{{sub}}", BRAND.sub)
  .replace("{{closer}}", BRAND.closer)
  .replace("{{footer}}", renderFooter(BRAND.name));

// Cache-bust CSS in homepage (prim subpages handled by template.ts setBuildHash)
const outBusted = out.replace('href="/assets/prim.css"', `href="/assets/prim.css?v=${buildHash}"`);

mkdirSync(resolve(ROOT, "site-dist"), { recursive: true });
writeFileSync(resolve(ROOT, "site-dist/index.html"), outBusted);
console.log("[build] site-dist/index.html written");

// ── access page ──────────────────────────────────────────────────────────────

const accessPath = resolve(ROOT, "site/access/index.html");
if (existsSync(accessPath)) {
  const accessSrc = readFileSync(accessPath, "utf-8");
  const accessOut = accessSrc.replace(
    "{{footer:access}}",
    renderFooter(`<a href="/">${BRAND.name}</a> / access`),
  );
  mkdirSync(resolve(ROOT, "site-dist/access"), { recursive: true });
  writeFileSync(resolve(ROOT, "site-dist/access/index.html"), accessOut);
  console.log("[build] site-dist/access/index.html written");
}

// ── discord redirect page ───────────────────────────────────────────────────

{
  const discordUrl = BRAND.social.discord;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Join prim.sh on Discord</title>
  <meta name="description" content="Join the prim.sh community on Discord. Build agent infrastructure together.">
  <meta name="theme-color" content="#0a0a0a">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="Join prim.sh on Discord">
  <meta property="og:description" content="Build agent infrastructure together. ${BRAND.tagline}">
  <meta property="og:image" content="https://prim.sh/assets/og/discord.png">
  <meta property="og:url" content="https://prim.sh/discord">

  <!-- Twitter card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@primitiveshell">
  <meta name="twitter:title" content="Join prim.sh on Discord">
  <meta name="twitter:description" content="Build agent infrastructure together. ${BRAND.tagline}">
  <meta name="twitter:image" content="https://prim.sh/assets/og/discord.png">

  <link rel="canonical" href="https://prim.sh/discord">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">

  <!-- Redirect to Discord invite -->
  <meta http-equiv="refresh" content="0;url=${discordUrl}">
  <style>
    body {
      background: #0a0a0a;
      color: #e0e0e0;
      font-family: 'SF Mono', SFMono-Regular, 'Cascadia Code', Consolas, monospace;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    a { color: #5865F2; }
  </style>
</head>
<body>
  <p>Redirecting to <a href="${discordUrl}">Discord</a>\u2026</p>
  <script>window.location.href="${discordUrl}";</script>
</body>
</html>`;
  mkdirSync(resolve(ROOT, "site-dist/discord"), { recursive: true });
  writeFileSync(resolve(ROOT, "site-dist/discord/index.html"), html);
  console.log("[build] site-dist/discord/index.html generated");
}

// ── prim subpages from prim.yaml ─────────────────────────────────────────────

function loadPrimYaml(id: string): PrimConfig | null {
  const candidates = [join(ROOT, `packages/${id}/prim.yaml`), join(ROOT, `site/${id}/prim.yaml`)];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return parse(readFileSync(p, "utf-8")) as PrimConfig;
      } catch (e) {
        console.error(`[build] Failed to parse ${p}:`, e);
      }
    }
  }
  return null;
}

const primIds = new Set<string>();
for (const dir of readdirSync(join(ROOT, "packages"))) {
  if (existsSync(join(ROOT, `packages/${dir}/prim.yaml`))) primIds.add(dir);
}
for (const dir of readdirSync(join(ROOT, "site"))) {
  if (existsSync(join(ROOT, `site/${dir}/prim.yaml`))) primIds.add(dir);
}

let primCount = 0;
for (const id of primIds) {
  const cfg = loadPrimYaml(id);
  if (!cfg || !cfg.tagline || !cfg.sub) continue;
  const html = render(cfg);
  mkdirSync(resolve(ROOT, `site-dist/${cfg.id}`), { recursive: true });
  writeFileSync(resolve(ROOT, `site-dist/${cfg.id}/index.html`), html);
  primCount++;
}
console.log(`[build] ${primCount} prim pages written`);

// ── per-prim llms.txt ───────────────────────────────────────────────────────

let llmsCount = 0;
for (const id of primIds) {
  const candidates = [join(ROOT, `site/${id}/llms.txt`), join(ROOT, `packages/${id}/llms.txt`)];
  for (const p of candidates) {
    if (existsSync(p)) {
      mkdirSync(resolve(ROOT, `site-dist/${id}`), { recursive: true });
      cpSync(p, resolve(ROOT, `site-dist/${id}/llms.txt`));
      llmsCount++;
      break;
    }
  }
}
console.log(`[build] ${llmsCount} per-prim llms.txt copied`);

// ── discovery / static files ────────────────────────────────────────────────

const staticFiles = [
  "llms.txt",
  "pricing.json",
  "discovery.json",
  "sitemap.xml",
  "robots.txt",
  "_headers",
  "_redirects",
];

for (const f of staticFiles) {
  const src = resolve(ROOT, `site/${f}`);
  if (existsSync(src)) {
    cpSync(src, resolve(ROOT, `site-dist/${f}`));
    console.log(`[build] site-dist/${f} copied`);
  }
}

// ── .well-known ─────────────────────────────────────────────────────────────

const wellKnownDir = resolve(ROOT, "site/.well-known");
if (existsSync(wellKnownDir)) {
  mkdirSync(resolve(ROOT, "site-dist/.well-known"), { recursive: true });
  for (const f of readdirSync(wellKnownDir)) {
    cpSync(join(wellKnownDir, f), resolve(ROOT, `site-dist/.well-known/${f}`));
    console.log(`[build] site-dist/.well-known/${f} copied`);
  }
}

// ── OpenAPI specs ───────────────────────────────────────────────────────────

const openapiDir = resolve(ROOT, "specs/openapi");
if (existsSync(openapiDir)) {
  mkdirSync(resolve(ROOT, "site-dist/openapi"), { recursive: true });
  let specCount = 0;
  for (const f of readdirSync(openapiDir)) {
    if (f.endsWith(".yaml")) {
      cpSync(join(openapiDir, f), resolve(ROOT, `site-dist/openapi/${f}`));
      specCount++;
    }
  }
  console.log(`[build] ${specCount} OpenAPI specs copied to site-dist/openapi/`);
}

// ── legal pages (terms, privacy) from page.yaml ─────────────────────────────

let legalCount = 0;
for (const dir of readdirSync(join(ROOT, "site"))) {
  const yamlPath = join(ROOT, `site/${dir}/page.yaml`);
  if (existsSync(yamlPath)) {
    try {
      const cfg = parse(readFileSync(yamlPath, "utf-8")) as LegalConfig;
      const html = renderLegal(cfg);
      mkdirSync(resolve(ROOT, `site-dist/${cfg.id}`), { recursive: true });
      writeFileSync(resolve(ROOT, `site-dist/${cfg.id}/index.html`), html);
      legalCount++;
    } catch (e) {
      console.error(`[build] Failed to parse ${yamlPath}:`, e);
    }
  }
}
console.log(`[build] ${legalCount} legal pages written`);

// ── assets ──────────────────────────────────────────────────────────────────

const assetsDir = resolve(ROOT, "site/assets");
if (existsSync(assetsDir)) {
  cpSync(assetsDir, resolve(ROOT, "site-dist/assets"), { recursive: true });
  console.log("[build] site-dist/assets/ copied");
}
