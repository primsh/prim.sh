// site/template.ts — SSR template for prim.sh primitive pages
// render(config) → HTML string. CSS is inlined.

import { BRAND } from "./brand.ts";

export interface PricingRow {
  op: string;
  price: string;
  note: string;
}

export interface CardItem {
  title: string;
  body: string;
}

export interface CardsSection {
  type: "cards";
  title: string;
  highlight?: string;
  items: CardItem[];
}

export interface CodeSection {
  type: "code";
  title: string;
  highlight?: string;
  lines?: string[]; // "POST /v1/path  # comment" or "# comment" or plain
  raw?: string; // freeform preformatted block
}

export interface FlowSection {
  type: "flow";
  title: string;
  highlight?: string;
  note?: string;
  steps: string[];
}

export interface ManifestoSection {
  type: "manifesto";
  title: string;
  highlight?: string;
  paragraphs: string[];
}

export interface PricingSection {
  type: "pricing";
  note?: string;
  columns?: string[];
  rows?: string[][];
}

export interface CliSection {
  type: "cli";
  title: string;
  highlight?: string;
  note?: string;
  commands: string[];
}

export type Section =
  | CardsSection
  | CodeSection
  | FlowSection
  | ManifestoSection
  | PricingSection
  | CliSection;

export interface PrimConfig {
  id: string;
  name: string;
  endpoint: string;
  status: "mainnet" | "testnet" | "hold" | "phantom";
  type?: string;
  card_class?: string;
  description?: string;
  port?: number;
  order?: number;
  phantom?: boolean;
  env?: string[];
  pricing?: PricingRow[];

  // SITE-1 fields — accent derived from category if not set
  accent?: string;
  accent_dim?: string;
  accent_glow?: string;
  category?: string;
  nounStyled?: string;
  tagline: string;
  sub: string;
  hero_badges?: string[];
  hero_example?: string;
  cta?: { headline: string; sub: string };
  sections?: Section[];

  // Enrichment fields
  interfaces?: { mcp?: boolean; cli?: boolean; tools?: boolean; rest?: boolean };
  quick_start?: string[];
  tips?: string[];
  limits?: string[];
  ownership?: string;
  providers?: { name: string; status?: string; url?: string }[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Convert **bold** markers → <strong>bold</strong> */
function bold(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/** Render interface badges row (REST · CLI · MCP · Tools) */
function renderInterfaces(ifaces: NonNullable<PrimConfig["interfaces"]>): string {
  const items: string[] = [];
  if (ifaces.rest) items.push("REST");
  if (ifaces.cli) items.push("CLI");
  if (ifaces.mcp) items.push("MCP");
  if (ifaces.tools) items.push("Tools");
  if (items.length === 0) return "";
  return `<div class="ifaces">${items.map((i) => `<span class="iface">${i}</span>`).join("")}</div>`;
}

/** Render quick_start, tips, limits, ownership blocks */
function renderEnrichment(cfg: PrimConfig): string {
  const parts: string[] = [];

  if (cfg.quick_start && cfg.quick_start.length > 0) {
    const steps = cfg.quick_start
      .map((s, i) => `    <li><span class="num">${i + 1}</span>${esc(s)}</li>`)
      .join("\n");
    parts.push(`<section>
  <h2>Quick <span>start</span></h2>
  <ol class="qs-list">
${steps}
  </ol>
</section>`);
  }

  if (cfg.tips && cfg.tips.length > 0) {
    const items = cfg.tips.map((t) => `    <li>${esc(t)}</li>`).join("\n");
    parts.push(`<section>
  <h2><span>Tips</span></h2>
  <ul class="enrich-list">
${items}
  </ul>
</section>`);
  }

  if (cfg.limits && cfg.limits.length > 0) {
    const items = cfg.limits.map((l) => `    <li>${esc(l)}</li>`).join("\n");
    parts.push(`<section>
  <h2>Limits &amp; <span>quotas</span></h2>
  <ul class="enrich-list">
${items}
  </ul>
</section>`);
  }

  if (cfg.ownership) {
    parts.push(`<section>
  <div class="ownership-box">
    <strong>Ownership</strong>
    <p>${esc(cfg.ownership)}</p>
  </div>
</section>`);
  }

  if (cfg.providers && cfg.providers.length > 0) {
    const links = cfg.providers
      .map((p) =>
        p.url
          ? `<a href="${esc(p.url)}" class="provider-link">${esc(p.name)}</a>`
          : `<span class="provider-link">${esc(p.name)}</span>`,
      )
      .join("");
    parts.push(`<section>
  <div class="providers-row">
    <span class="providers-label">Powered by</span>${links}
  </div>
</section>`);
  }

  return parts.join("\n\n");
}

/** Status badge label + class */
function statusInfo(status: string): { cls: string; label: string } {
  switch (status) {
    case "mainnet":
      return { cls: "status-mainnet", label: "● Mainnet" };
    case "testnet":
      return { cls: "status-testnet", label: "● Testnet" };
    default:
      return { cls: "status-phantom", label: "○ Phantom" };
  }
}

/** Render a badge string preserving ** → bold */
function renderBadgeStr(badge: string): string {
  // esc without touching ** (** is ASCII so esc won't mangle it)
  const escaped = badge.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div class="badge">${bold(escaped)}</div>`;
}

/** Colorize a single line in a code section */
function colorizeLine(line: string): string {
  if (line === "") return "";
  if (line.startsWith("#")) {
    return `<span class="cc">${esc(line)}</span>`;
  }
  if (line.startsWith("$")) {
    return `<span class="prompt">$</span>${esc(line.slice(1))}`;
  }
  const match = line.match(/^(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)(\s+)(\S+)(.*)$/);
  if (match) {
    const [, method, sp1, path, rest] = match;
    const commentMatch = rest.match(/^(\s+)(#.*)$/);
    if (commentMatch) {
      const [, sp2, comment] = commentMatch;
      return `<span class="a">${method}</span>${sp1}<span class="w">${esc(path)}</span>${sp2}<span class="mc">${esc(comment)}</span>`;
    }
    return `<span class="a">${method}</span>${sp1}<span class="w">${esc(path)}</span>${esc(rest)}`;
  }
  return esc(line);
}

/** Colorize a quoted string token "..." or '...' with $VAR highlighting */
function colorizeStr(tok: string): string {
  const q = tok[0];
  const inner = tok.slice(1, -1);
  const segs = inner.split(/(\$[A-Za-z_]\w*)/);
  const innerHtml = segs
    .map((seg, i) => (i % 2 === 1 ? `<span class="a">${esc(seg)}</span>` : esc(seg)))
    .join("");
  return `<span class="str">${esc(q)}${innerHtml}${esc(q)}</span>`;
}

/** Colorize a `$ ...` shell command line */
function colorizeShellCmd(line: string): string {
  const trimmed = line.trimEnd();
  const hasCont = trimmed.endsWith("\\");
  const body = hasCont ? trimmed.slice(0, -1).trimEnd() : trimmed;

  let out = `<span class="prompt">$</span>`;
  const rest = body.slice(1); // drop leading $

  const re = /( +|https?:\/\/\S+|"[^"]*"|'[^']*'|-[\w-]+|\S+)/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(rest)) !== null) {
    const tok = m[0];
    if (/^ +$/.test(tok)) {
      out += tok;
    } else if (tok === "curl") {
      out += `<span class="a">curl</span>`;
    } else if (/^(POST|GET|PUT|DELETE|PATCH|HEAD)$/.test(tok)) {
      out += `<span class="a">${tok}</span>`;
    } else if (/^https?:\/\//.test(tok)) {
      out += `<span class="w">${esc(tok)}</span>`;
    } else if (/^-/.test(tok)) {
      out += `<span class="flag">${esc(tok)}</span>`;
    } else if (/^["']/.test(tok)) {
      out += colorizeStr(tok);
    } else {
      out += esc(tok);
    }
  }

  if (hasCont) out += ` <span class="cont">\\</span>`;
  return out;
}

/** Colorize a curl continuation flag line: `    -H "..." \` */
function colorizeFlagArg(line: string): string {
  const trimmed = line.trimEnd();
  const hasCont = trimmed.endsWith("\\");
  const body = hasCont ? trimmed.slice(0, -1).trimEnd() : trimmed;

  const m = body.match(/^( +)(-[\w-]+)(.*)?$/);
  if (!m) return esc(line);
  const [, indent, flag, rest] = m;

  let out = `${indent}<span class="flag">${esc(flag)}</span>`;
  if (rest) {
    const re = /( +|"[^"]*"|'[^']*'|\S+)/g;
    let tm: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
    while ((tm = re.exec(rest)) !== null) {
      const tok = tm[0];
      if (/^ +$/.test(tok)) {
        out += tok;
      } else if (/^["']/.test(tok)) {
        out += colorizeStr(tok);
      } else {
        out += esc(tok);
      }
    }
  }

  if (hasCont) out += ` <span class="cont">\\</span>`;
  return out;
}

/** Colorize JSON value segments (non-key parts) */
function colorizeJsonValues(s: string): string {
  let out = "";
  const re = /("(?:[^"\\]|\\.)*"|\btrue\b|\bfalse\b|\bnull\b|\b\d+\.?\d*\b|[\s\S])/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(s)) !== null) {
    const tok = m[0];
    if (/^"/.test(tok)) {
      out += `<span class="w">${esc(tok)}</span>`;
    } else if (/^(true|false|null)$/.test(tok)) {
      out += `<span class="a">${tok}</span>`;
    } else if (/^\d/.test(tok)) {
      out += `<span class="a">${tok}</span>`;
    } else {
      out += esc(tok);
    }
  }
  return out;
}

/** Colorize a JSON line: keys as muted, string values as text, numbers/bools as accent */
function colorizeJsonLine(line: string): string {
  const parts = line.split(/("(?:[^"\\]|\\.)*"\s*:)/);
  return parts
    .map((part, i) =>
      i % 2 === 1 ? `<span class="mc">${esc(part)}</span>` : colorizeJsonValues(part),
    )
    .join("");
}

/** Colorize a raw hero_example block */
function colorizeHeroBlock(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      if (line === "") return "";
      if (line.startsWith("#")) return `<span class="cc">${esc(line)}</span>`;
      if (line.startsWith("$")) return colorizeShellCmd(line);
      if (/^ +-/.test(line)) return colorizeFlagArg(line);
      return colorizeJsonLine(line);
    })
    .join("\n");
}

// ── footer ────────────────────────────────────────────────────────────────────

/** Render the shared footer. crumb = "prim.sh" or "prim.sh / wallet.sh" */
export function renderFooter(crumb: string): string {
  return `<footer>
  <div class="footer-crumb">${crumb}</div>
  <div class="links">
    <a href="/wallet" style="color:var(--cat-crypto)">wallet</a>
    <a href="/faucet" style="color:var(--cat-crypto)">faucet</a>
    <a href="/store" style="color:var(--cat-storage)">store</a>
    <a href="/search" style="color:var(--cat-intelligence)">search</a>
  </div>
  <div class="links">
    <a href="https://x.com/useprim">x</a>
    <a href="https://github.com/primsh">github</a>
    <a href="https://discord.gg/VbFseNDZ">discord</a>
    <a href="/access">access</a>
    <a href="/llms.txt">llms.txt</a>
  </div>
  <div class="copyright">${BRAND.copyright}</div>
</footer>`;
}

// ── section renderers ─────────────────────────────────────────────────────────

function renderCards(s: CardsSection): string {
  const title = s.highlight
    ? `${esc(s.title)} <span>${esc(s.highlight)}</span>`
    : `<span>${esc(s.title)}</span>`;
  const cards = s.items
    .map((c) => `    <div class="card"><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></div>`)
    .join("\n");
  return `<section>
  <h2>${title}</h2>
  <div class="grid">
${cards}
  </div>
</section>`;
}

function renderCode(s: CodeSection): string {
  const title = s.highlight
    ? `${esc(s.title)} <span>${esc(s.highlight)}</span>`
    : `<span>${esc(s.title)}</span>`;
  let inner: string;
  if (s.raw !== undefined) {
    inner = colorizeHeroBlock(s.raw.replace(/\n$/, ""));
  } else if (s.lines) {
    inner = s.lines.map(colorizeLine).join("\n");
  } else {
    inner = "";
  }
  return `<section>
  <h2>${title}</h2>
  <pre><code>${inner}</code></pre>
</section>`;
}

function renderFlow(s: FlowSection): string {
  const title = s.highlight
    ? `${esc(s.title)} <span>${esc(s.highlight)}</span>`
    : `<span>${esc(s.title)}</span>`;
  const steps = s.steps
    .flatMap((step, i) => {
      const stepEl = `    <div class="flow-step"><div class="num">${i + 1}</div><div class="label">${esc(step)}</div></div>`;
      if (i < s.steps.length - 1) return [stepEl, '    <div class="flow-arrow">→</div>'];
      return [stepEl];
    })
    .join("\n");
  const note = s.note
    ? `\n  <p style="color:var(--muted);text-align:center;margin-top:1rem">${esc(s.note)}</p>`
    : "";
  return `<section>
  <h2>${title}</h2>
  <div class="flow">
${steps}
  </div>${note}
</section>`;
}

function renderManifesto(s: ManifestoSection): string {
  const title = s.highlight
    ? `${esc(s.title)} <span>${esc(s.highlight)}</span>`
    : `<span>${esc(s.title)}</span>`;
  const paras = s.paragraphs.map((p) => `    <p>${bold(esc(p))}</p>`).join("\n");
  return `<section>
  <h2>${title}</h2>
  <div class="manifesto">
${paras}
  </div>
</section>`;
}

function renderPricingSection(s: PricingSection): string {
  const cols = s.columns ?? ["Action", "Cost", "Notes"];
  const note = s.note
    ? `\n  <p style="color:var(--muted);margin-bottom:1rem">${esc(s.note)}</p>`
    : "";
  const thead = `    <thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>`;
  const rows = (s.rows ?? [])
    .map((row) => `      <tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
    .join("\n");
  return `<section>
  <h2><span>Pricing</span></h2>${note}
  <div class="pricing-card">
  <table class="pricing-table">
${thead}
    <tbody>
${rows}
    </tbody>
  </table>
  </div>
</section>`;
}

function renderPricingFromTopLevel(rows: PricingRow[]): string {
  const rowsHtml = rows
    .map(
      (r) => `      <tr><td>${esc(r.op)}</td><td>${esc(r.price)}</td><td>${esc(r.note)}</td></tr>`,
    )
    .join("\n");
  return `<section>
  <h2><span>Pricing</span></h2>
  <div class="pricing-card">
  <table class="pricing-table">
    <thead><tr><th>Action</th><th>Cost</th><th>Notes</th></tr></thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
  </div>
</section>`;
}

function renderCli(s: CliSection): string {
  const title = s.highlight
    ? `${esc(s.title)} <span>${esc(s.highlight)}</span>`
    : `<span>${esc(s.title)}</span>`;
  const note = s.note
    ? `\n  <p style="color:var(--muted);margin-bottom:1rem">${esc(s.note)}</p>`
    : "";
  const cmds = s.commands.map((cmd) => `<span class="prompt">$</span> ${esc(cmd)}`).join("\n");
  return `<section>
  <h2>${title}</h2>${note}
  <pre><code>${cmds}</code></pre>
</section>`;
}

function renderSection(s: Section): string {
  switch (s.type) {
    case "cards":
      return renderCards(s);
    case "code":
      return renderCode(s);
    case "flow":
      return renderFlow(s);
    case "manifesto":
      return renderManifesto(s);
    case "pricing":
      return renderPricingSection(s);
    case "cli":
      return renderCli(s);
    default:
      return "";
  }
}

// ── phantom template ─────────────────────────────────────────────────────────

function renderComingSoon(cfg: PrimConfig): string {
  const primId = cfg.id;
  const primName = cfg.name; // e.g. "wallet.sh"
  const [namePart, ext] = primName.split(".");
  const { cls, label } = statusInfo(cfg.status);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(cfg.name)} — ${esc(cfg.tagline)}</title>
${headMeta(cfg)}
${inlineCSS(cfg)}
</head>
<body>
<div class="hero">
  <img class="logomark" src="/assets/hero.jpg" alt=">|">
  <div class="hero-hd"><a href="/" class="pill"><span class="parent">${BRAND.name}</span><span class="sep">/</span><span class="child">${esc(cfg.name)}</span></a></div>
  <h1 class="logo"><span>${esc(namePart)}</span>.${ext ?? "sh"}</h1>${cfg.nounStyled ? `\n  <div class="tagline" style="color:var(--muted);font-size:1.1rem;margin-bottom:0.5rem">${esc(cfg.nounStyled)}</div>` : ""}
  <div class="tagline">${esc(cfg.tagline)}</div>
  <div class="badges">
    <div class="badge">Part of <strong>${BRAND.name}</strong></div>
    <span class="badge ${cls}">${label}</span>
  </div>
</div>
${renderFooter(`<a href="/">${BRAND.name}</a> / ${esc(cfg.name)}`)}
<img src="/assets/banner.jpg" alt="" class="img-fade" style="width:100%;display:block;margin:0;padding:0">
</body>
</html>`;
}

// ── Head helpers ──────────────────────────────────────────────────────────────

/** Cache-bust hash — set by build.ts via setBuildHash(), falls back to timestamp */
let _buildHash = Date.now().toString(36);
export function setBuildHash(hash: string): void {
  _buildHash = hash;
}

function inlineCSS(cfg: PrimConfig): string {
  const category = cfg.category ?? "meta";
  // Derive accent from category — single source of truth in prim.css --cat-* vars
  // Allow explicit accent override in prim.yaml for special cases
  const accent = cfg.accent ?? `var(--cat-${category})`;
  const isVar = accent.startsWith("var(");
  const dim = cfg.accent_dim ?? (isVar ? `color-mix(in srgb, ${accent} 80%, black)` : accent);
  const glow =
    cfg.accent_glow ?? (isVar ? `color-mix(in srgb, ${accent} 8%, transparent)` : accent);
  return `<link rel="stylesheet" href="/assets/prim.css?v=${_buildHash}">
<style>:root{--accent:${accent};--accent-dim:${dim};--accent-glow:${glow}}</style>`;
}

function headMeta(cfg: PrimConfig): string {
  const title = `${esc(cfg.name)} — ${esc(cfg.tagline)}`;
  const desc = esc(cfg.sub);
  return `<meta name="description" content="${desc}">
<meta name="theme-color" content="#0a0a0a">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="https://prim.sh/assets/og/${esc(cfg.id)}.png">
<meta property="og:url" content="https://prim.sh/${esc(cfg.id)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@useprim">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="https://prim.sh/assets/og/${esc(cfg.id)}.png">
<link rel="canonical" href="https://prim.sh/${esc(cfg.id)}">
<link rel="icon" type="image/png" href="/assets/favicon.png">
<link rel="apple-touch-icon" href="/assets/logo.png">`;
}

// ── main render ───────────────────────────────────────────────────────────────

export function render(cfg: PrimConfig): string {
  // Non-deployed prims use minimal coming-soon template
  if (cfg.status !== "mainnet" && cfg.status !== "testnet") {
    return renderComingSoon(cfg);
  }

  const primName = cfg.name; // e.g. "wallet.sh"
  const [namePart, ext] = primName.split(".");
  const { cls, label } = statusInfo(cfg.status);

  // Hero badges
  const badgesHtml = [
    ...(cfg.hero_badges ?? []).map(renderBadgeStr),
    `<div class="badge">Part of <strong>${BRAND.name}</strong></div>`,
    `<span class="badge ${cls}">${label}</span>`,
  ].join("\n    ");

  // Interface badges (REST · CLI · MCP · Tools)
  const ifacesHtml = cfg.interfaces ? renderInterfaces(cfg.interfaces) : "";

  // Hero install command
  const installUrl = `https://${cfg.endpoint}/install.sh`;
  const heroBlock = `  <div class="cmd-block glow-multi"><code><span class="prompt">$</span> <span class="a">curl</span> <span class="flag">-fsSL</span> <span class="w">${esc(installUrl)}</span> <span class="flag">|</span> sh</code><button class="copy-btn" onclick="const b=this,c=this.closest('.cmd-block').querySelector('code');navigator.clipboard.writeText(c.textContent.trim()).then(()=>{b.textContent='copied';b.classList.add('copied');setTimeout(()=>{b.textContent='copy';b.classList.remove('copied')},2000)})">copy</button></div>`;

  // Sections
  const hasPricingSection = (cfg.sections ?? []).some((s) => s.type === "pricing");
  let sectionsHtml = (cfg.sections ?? []).map(renderSection).join("\n\n");
  if (!hasPricingSection && cfg.pricing && cfg.pricing.length > 0) {
    sectionsHtml += `\n\n${renderPricingFromTopLevel(cfg.pricing)}`;
  }

  // Enrichment (quick_start, tips, limits, ownership, providers)
  const enrichHtml = renderEnrichment(cfg);

  // CTA
  const ctaHeadline = cfg.cta?.headline ?? "";
  const ctaSub = cfg.cta?.sub ?? "";
  const ctaHtml = ctaHeadline
    ? `<div class="cta-section">
  <h2 style="margin-bottom:0.5rem">${bold(esc(ctaHeadline))}</h2>
  <p style="color:var(--muted);margin-bottom:2rem">${esc(ctaSub)}</p>
  <a href="https://prim.sh/${cfg.id}" class="cta-btn">Read the docs →</a>
</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(cfg.name)} — ${esc(cfg.tagline)}</title>
${headMeta(cfg)}
${inlineCSS(cfg)}
</head>
<body>
<div class="hero">
  <img class="logomark" src="/assets/hero.jpg" alt=">|">
  <div class="hero-hd"><a href="/" class="pill"><span class="parent">${BRAND.name}</span><span class="sep">/</span><span class="child">${esc(cfg.name)}</span></a></div>
  <h1 class="logo"><span>${esc(namePart ?? cfg.id)}</span>.${esc(ext ?? "sh")}</h1>${cfg.nounStyled ? `\n  <div class="tagline" style="color:var(--muted);font-size:1.1rem;margin-bottom:0.5rem">${esc(cfg.nounStyled)}</div>` : ""}
  <div class="tagline">${esc(cfg.tagline)}</div>
${heroBlock}
  <div class="badges">
    ${badgesHtml}
  </div>
${ifacesHtml}
</div>
<img id="content" src="/assets/prims.jpg" alt="${BRAND.name} primitives" class="img-fade" style="width:100%;display:block">

${sectionsHtml}

${enrichHtml}

${ctaHtml}

${renderFooter(`<a href="/">${BRAND.name}</a> / ${esc(cfg.name)}`)}
<img src="/assets/banner.jpg" alt="" class="img-fade" style="width:100%;display:block;margin:0;padding:0">
</body>
</html>`;
}
