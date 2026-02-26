// site/template.ts — SSR template for prim.sh primitive pages
// render(config) → HTML string. CSS is inlined.

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
  status: "deployed" | "testing" | "built" | "building" | "soon";
  type?: string;
  card_class?: string;
  description?: string;
  port?: number;
  order?: number;
  phantom?: boolean;
  env?: string[];
  pricing?: PricingRow[];

  // SITE-1 fields
  accent: string;
  accent_dim: string;
  accent_glow: string;
  tagline: string;
  sub: string;
  hero_badges?: string[];
  hero_example?: string;
  cta?: { headline: string; sub: string };
  sections?: Section[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Convert **bold** markers → <strong>bold</strong> */
function bold(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/** Status badge label + class */
function statusInfo(status: string): { cls: string; label: string } {
  switch (status) {
    case "deployed":
      return { cls: "status-live", label: "● Live" };
    case "testing":
      return { cls: "status-testing", label: "● Live (testnet)" };
    case "built":
      return { cls: "status-built", label: "○ Built — deploy pending" };
    case "building":
      return { cls: "status-building", label: "◌ Building" };
    default:
      return { cls: "status-soon", label: "○ Coming soon" };
  }
}

/** Render a badge string preserving ** → bold */
function renderBadgeStr(badge: string): string {
  // esc without touching ** (** is ASCII so esc won't mangle it)
  const escaped = badge
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div class="badge">${bold(escaped)}</div>`;
}

const HTTP_METHODS = /^(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)\s/;

/** Colorize a single line in a code section */
function colorizeLine(line: string): string {
  if (line === "") return "";
  if (line.startsWith("#")) {
    return `<span class="c">${esc(line)}</span>`;
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
      return `<span class="a">${method}</span>${sp1}<span class="w">${esc(path)}</span>${sp2}<span class="m">${esc(comment)}</span>`;
    }
    return `<span class="a">${method}</span>${sp1}<span class="w">${esc(path)}</span>${esc(rest)}`;
  }
  return esc(line);
}

/** Colorize a raw hero_example block */
function colorizeHeroBlock(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      if (line.startsWith("#")) return `<span class="comment">${esc(line)}</span>`;
      if (line.startsWith("$")) return `<span class="prompt">$</span>${esc(line.slice(1))}`;
      return esc(line);
    })
    .join("\n");
}

// ── section renderers ─────────────────────────────────────────────────────────

function renderCards(s: CardsSection): string {
  const title = s.highlight
    ? `${esc(s.title)} <span>${esc(s.highlight)}</span>`
    : `<span>${esc(s.title)}</span>`;
  const cards = s.items
    .map(
      (c) =>
        `    <div class="card"><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></div>`
    )
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
      if (i < s.steps.length - 1)
        return [stepEl, '    <div class="flow-arrow">→</div>'];
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
  const paras = s.paragraphs
    .map((p) => `    <p>${bold(esc(p))}</p>`)
    .join("\n");
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
  <table class="pricing-table">
${thead}
    <tbody>
${rows}
    </tbody>
  </table>
</section>`;
}

function renderPricingFromTopLevel(rows: PricingRow[]): string {
  const rowsHtml = rows
    .map((r) => `      <tr><td>${esc(r.op)}</td><td>${esc(r.price)}</td><td>${esc(r.note)}</td></tr>`)
    .join("\n");
  return `<section>
  <h2><span>Pricing</span></h2>
  <table class="pricing-table">
    <thead><tr><th>Action</th><th>Cost</th><th>Notes</th></tr></thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
</section>`;
}

function renderCli(s: CliSection): string {
  const title = s.highlight
    ? `${esc(s.title)} <span>${esc(s.highlight)}</span>`
    : `<span>${esc(s.title)}</span>`;
  const note = s.note
    ? `\n  <p style="color:var(--muted);margin-bottom:1rem">${esc(s.note)}</p>`
    : "";
  const cmds = s.commands
    .map((cmd) => `<span class="prompt">$</span> ${esc(cmd)}`)
    .join("\n");
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

// ── coming-soon template ──────────────────────────────────────────────────────

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
${inlineCSS(cfg.accent, cfg.accent_dim, cfg.accent_glow)}
</head>
<body>
<div class="hero">
  <img class="logomark" src="/assets/hero.jpg" alt=">|">
  <div class="hero-hd"><a href="/">prim.sh / <span>${esc(cfg.name)}</span></a></div>
  <div class="logo"><span>${esc(namePart)}</span>.${ext ?? "sh"}</div>
  <div class="tagline">${esc(cfg.tagline)}</div>
  <div class="sub">${esc(cfg.sub)}</div>
  <div class="badges">
    <div class="badge">Part of <strong>prim.sh</strong></div>
    <span class="badge ${cls}">${label}</span>
  </div>
  <div class="scroll-hint">↓ scroll</div>
</div>
<footer>
  <div>${esc(cfg.name)} — part of <a href="/">prim.sh</a></div>
  <div class="links"><a href="/">prim.sh</a></div>
  <div style="margin-top:0.75rem;font-size:0.8rem;color:#444">This page is for humans. The API is for agents.</div>
</footer>
<img src="/assets/banner.jpg" alt="" style="width:100%;display:block;margin:0;padding:0">
</body>
</html>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function inlineCSS(accent: string, accentDim: string, accentGlow: string): string {
  return `<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0a0a;--surface:#111;--border:#1a1a1a;--text:#e0e0e0;--muted:#666;--code-bg:#0d0d0d;--accent:${accent};--accent-dim:${accentDim};--accent-glow:${accentGlow}}
body{background:var(--bg);color:var(--text);font-family:'SF Mono',SFMono-Regular,'Cascadia Code',Consolas,monospace;line-height:1.6;overflow-x:hidden}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.hero{min-height:100vh;display:flex;flex-direction:column;padding:0 2rem 2rem;justify-content:flex-start;align-items:center;text-align:center;position:relative}
.hero::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:600px;background:radial-gradient(circle,var(--accent-glow) 0%,transparent 70%);pointer-events:none}
.logomark{width:calc(100% + 4rem);margin-left:-2rem;height:auto;display:block;margin-bottom:0.5rem}
.hero-hd{position:absolute;top:1.75rem;left:0;right:0;display:flex;justify-content:center;pointer-events:none;z-index:1}.hero-hd a{pointer-events:all;color:#444;text-decoration:none;font-size:0.8rem;letter-spacing:0.04em;border:1px solid #222;border-radius:20px;padding:0.3rem 1rem;transition:color 0.15s,border-color 0.15s}.hero-hd a:hover{color:var(--accent);border-color:var(--accent)}.hero-hd a span{color:var(--accent)}
.logo{font-size:3.5rem;font-weight:700;letter-spacing:-0.03em;margin-bottom:0.5rem;margin-top:2.5rem}.logo span{color:var(--accent)}
.tagline{font-size:1.3rem;color:var(--muted);margin-bottom:0.5rem}
.sub{font-size:1rem;color:var(--muted);margin-bottom:3rem;max-width:560px}
.cmd-block{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;padding:1.5rem 2rem;margin-bottom:3rem;text-align:left;max-width:640px;width:100%}
.cmd-block .prompt{color:var(--accent);user-select:none}.cmd-block .comment{color:#444}
.cmd-block code{font-size:0.95rem;line-height:1.8}
.badges{display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;margin-bottom:3rem}
.badge{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:0.5rem 1rem;font-size:0.85rem;color:var(--muted)}.badge strong{color:var(--accent)}.badge.status-testing{background:rgba(0,200,80,0.08);border-color:rgba(0,200,80,0.3);color:#00c850}.badge.status-live{background:rgba(0,255,100,0.1);border-color:rgba(0,255,100,0.4);color:#00ff64}.badge.status-built{background:rgba(255,200,0,0.08);border-color:rgba(255,200,0,0.3);color:#ffc800}.badge.status-building{background:rgba(255,140,0,0.08);border-color:rgba(255,140,0,0.3);color:#ff8c00}.badge.status-soon{background:var(--surface);border-color:var(--border);color:var(--muted)}
.scroll-hint{color:var(--muted);font-size:0.8rem;animation:pulse 2s infinite}@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}
section{max-width:900px;margin:0 auto;padding:4rem 2rem}
h2{font-size:1.8rem;margin-bottom:1.5rem;font-weight:600;text-align:center}h2 span{color:var(--accent)}
h3{font-size:1.1rem;margin-bottom:0.75rem;color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem;margin-bottom:2rem}
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1.5rem;box-shadow:0 0 20px var(--accent-glow)}
.card p{color:var(--muted);font-size:0.9rem;margin-top:0.5rem}
pre{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;padding:1.5rem;overflow-x:auto;font-size:0.85rem;line-height:1.7;margin:1rem 0}
.a{color:var(--accent)}.c{color:#444}.w{color:var(--text)}.m{color:var(--muted)}.prompt{color:var(--accent);user-select:none}
.flow{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin:2rem 0;justify-content:center}
.flow-step{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1rem 1.25rem;text-align:center;min-width:140px}
.flow-step .num{color:var(--accent);font-size:1.5rem;font-weight:700}
.flow-step .label{color:var(--muted);font-size:0.85rem;margin-top:0.25rem}
.flow-arrow{color:var(--accent);font-size:1.5rem}
.manifesto{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:2rem;margin:2rem 0}
.manifesto p{color:var(--muted);font-size:0.95rem;margin-bottom:1rem}.manifesto p:last-child{margin-bottom:0}
.manifesto strong{color:var(--text)}
.pricing-table{width:100%;border-collapse:collapse;margin:1.5rem 0}
.pricing-table th{text-align:left;color:var(--accent);padding:0.75rem;border-bottom:1px solid var(--border);font-weight:500}
.pricing-table td{padding:0.75rem;border-bottom:1px solid var(--border);color:var(--muted)}.pricing-table td:first-child{color:var(--text)}
footer{text-align:center;padding:3rem 2rem;color:var(--muted);font-size:0.85rem;border-top:1px solid var(--border)}
footer .links{margin-top:0.5rem}footer .links a{margin:0 0.75rem}
.cta-section{text-align:center;padding:4rem 2rem}
.cta-btn{display:inline-block;background:var(--accent);color:#000;padding:0.75rem 2rem;border-radius:6px;font-weight:700;font-size:1rem;font-family:inherit}.cta-btn:hover{background:var(--accent-dim);text-decoration:none}
@media(max-width:600px){.logo{font-size:2.5rem}.flow{flex-direction:column}.flow-arrow{transform:rotate(90deg)}pre{font-size:0.75rem}}
</style>`;
}

// ── main render ───────────────────────────────────────────────────────────────

export function render(cfg: PrimConfig): string {
  // Coming-soon pages use minimal template
  if (!cfg.sections && cfg.status === "soon") {
    return renderComingSoon(cfg);
  }

  const primName = cfg.name; // e.g. "wallet.sh"
  const [namePart, ext] = primName.split(".");
  const { cls, label } = statusInfo(cfg.status);

  // Hero badges
  const badgesHtml = [
    ...(cfg.hero_badges ?? []).map(renderBadgeStr),
    `<div class="badge">Part of <strong>prim.sh</strong></div>`,
    `<span class="badge ${cls}">${label}</span>`,
  ].join("\n    ");

  // Hero example
  const heroBlock = cfg.hero_example
    ? `  <div class="cmd-block"><code>\n${colorizeHeroBlock(cfg.hero_example.replace(/\n$/, ""))}\n  </code></div>`
    : "";

  // Sections
  const hasPricingSection = (cfg.sections ?? []).some((s) => s.type === "pricing");
  let sectionsHtml = (cfg.sections ?? []).map(renderSection).join("\n\n");
  if (!hasPricingSection && cfg.pricing && cfg.pricing.length > 0) {
    sectionsHtml += "\n\n" + renderPricingFromTopLevel(cfg.pricing);
  }

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
${inlineCSS(cfg.accent, cfg.accent_dim, cfg.accent_glow)}
</head>
<body>
<div class="hero">
  <img class="logomark" src="/assets/hero.jpg" alt=">|">
  <div class="hero-hd"><a href="/">prim.sh / <span>${esc(cfg.name)}</span></a></div>
  <div class="logo"><span>${esc(namePart ?? cfg.id)}</span>.${esc(ext ?? "sh")}</div>
  <div class="tagline">${esc(cfg.tagline)}</div>
  <div class="sub">${esc(cfg.sub)}</div>
${heroBlock}
  <div class="badges">
    ${badgesHtml}
  </div>
  <div class="scroll-hint">↓ scroll</div>
</div>

${sectionsHtml}

${ctaHtml}

<footer>
  <div>${esc(cfg.name)} — part of <a href="/">prim.sh</a></div>
  <div class="links"><a href="https://prim.sh/${cfg.id}">Docs</a><a href="https://${esc(cfg.endpoint)}">API</a><a href="/">prim.sh</a></div>
  <div style="margin-top:0.75rem;font-size:0.8rem;color:#444">This page is for humans. The API is for agents.</div>
</footer>
<img src="/assets/banner.jpg" alt="" style="width:100%;display:block;margin:0;padding:0">
</body>
</html>`;
}
