#!/usr/bin/env bun
/**
 * gen-terminal-world.ts — generate all Terminal World assets
 *
 * Output:
 *   brand/terminal-world/<order>/icons/{id}.svg  — primitive icons (120x150)
 *   brand/terminal-world/<order>/cards/{id}.svg  — primitive cards (280x420)
 *   brand/terminal-world/<order>/<order>.svg     — order cards (280x420)
 *   brand/terminal-world/daemons/{id}.svg         — daemon cards (280x420)
 *   brand/terminal-world/shells/{id}.svg         — shell cards (280x420)
 *
 *   brand/terminal-world/agents/{id}.svg        — agent cards (280x420)
 *   brand/terminal-world/users/{id}.svg         — user archetype cards (280x420)
 *
 * Usage: bun scripts/gen-terminal-world.ts
 */

import opentype from "opentype.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadPrimitives, CATEGORY_COLORS, TYPE_TO_CATEGORY } from "./lib/primitives.js";
import type { PrimCategory } from "./lib/primitives.js";

const ROOT = resolve(import.meta.dir, "..");
const BASE = join(ROOT, "brand/terminal-world");
const FONT_PATH = "/Applications/Xcode.app/Contents/SharedFrameworks/DVTUserInterfaceKit.framework/Versions/A/Resources/Fonts/SF-Mono.ttf";

const BG = "#0a0a0a";
const DIM = "#2a2a2a";
const MUTED = "#444";
const ROUND = 3;
const LABEL_FONT = `'SF Mono', SFMono-Regular, Menlo, monospace`;
const font = opentype.loadSync(FONT_PATH);

const G = "#00ff88", C = "#4DD0E1";

// ── Primitive data ──────────────────────────────────────────────────────────

interface Primitive {
  id: string;
  name: string;
  chars: string;
  color: string;
  order: string;
  orderName: string;
  isUnion?: boolean;
  parents?: [string, string];
  knownAs?: [string, string];
  personality: string;
  description: string;
}

const primitives: Primitive[] = [
  // Union children
  { id: "chevron", name: "prompt", chars: ">", color: G, order: "cursors", orderName: "Union Child", isUnion: true, parents: ["The Cursors", "The IO"], knownAs: ["prompt", "out"], personality: "First and last. Both the beginning and the direction.", description: "Identity mark to Cursors. Redirect arrow to IO." },
  { id: "bar", name: "active", chars: "|", color: G, order: "operators", orderName: "Union Child", isUnion: true, parents: ["The Cursors", "The Operators"], knownAs: ["active", "pipe"], personality: "Present and connected. A place and a passage.", description: "Bar cursor to Cursors. Pipe connector to Operators." },
  // Cursors
  { id: "ready", name: "ready", chars: "_", color: G, order: "cursors", orderName: "The Cursors", personality: "Patient. Holds the line. Waiting is its work.", description: "Underscore cursor. Agent is idle. Input expected." },
  { id: "blink", name: "blink", chars: "!", color: G, order: "cursors", orderName: "The Cursors", personality: "Can't stay still. Demands attention. The loudest one in the room.", description: "Blinking cursor stand-in. Urgent state — error or action required." },
  { id: "arc", name: "arc", chars: ")", color: C, order: "cursors", orderName: "The Cursors", personality: "Doesn't belong. Showed up anyway. Completes something.", description: "Closing arc. Brand embellishment from >|). No formal cursor role." },
  // Operators
  { id: "and", name: "and", chars: "&&", color: G, order: "operators", orderName: "The Operators", personality: "Only moves when everything before it succeeded. Unforgiving.", description: "Logical AND. Proceeds only if previous command exited 0." },
  { id: "or", name: "or", chars: "||", color: G, order: "operators", orderName: "The Operators", personality: "Waits for failure. Then steps in. The backup plan.", description: "Logical OR. Runs only when the previous command failed." },
  { id: "spawn", name: "spawn", chars: "&", color: G, order: "operators", orderName: "The Operators", personality: "Doesn't wait for permission. Fires and forgets. Always running somewhere.", description: "Backgrounds a process. Returns control immediately." },
  { id: "seq", name: "seq", chars: ";", color: G, order: "operators", orderName: "The Operators", personality: "Runs regardless. Doesn't care if you failed. Just moves on.", description: "Sequential separator. Runs next command unconditionally." },
  { id: "assign", name: "assign", chars: "=", color: G, order: "operators", orderName: "The Operators", personality: "Binds forever. Until it doesn't. Names things into existence.", description: "Assignment. Binds a name to a value. No spaces allowed." },
  { id: "noop", name: "noop", chars: ":", color: C, order: "operators", orderName: "The Operators", personality: "Does nothing. Returns true. The most honest character here.", description: "The shell no-op. Always exits 0. The void that succeeds." },
  { id: "capture", name: "capture", chars: "$()", color: G, order: "operators", orderName: "The Operators", personality: "Runs something, takes its words. The modern way to listen.", description: "Command substitution. Captures stdout inline." },
  { id: "tick", name: "tick", chars: "`", color: G, order: "operators", orderName: "The Operators", personality: "The old way. Still works. Doesn't nest. Capture replaced it.", description: "Backtick. Legacy command substitution." },
  // IO
  { id: "append", name: "append", chars: ">>", color: G, order: "io", orderName: "The IO", personality: "Never overwrites. Just adds. Has been adding forever.", description: "Append stdout to file. Accumulates without destroying." },
  { id: "pull", name: "pull", chars: "<", color: G, order: "io", orderName: "The IO", personality: "Reaches backward. Takes what it needs from the source.", description: "Redirect stdin from file. Reads instead of listens." },
  { id: "here", name: "here", chars: "<<", color: G, order: "io", orderName: "The IO", personality: "Carries its own content. Self-sufficient. The one who brings the doc.", description: "Heredoc. Inline input block delivered directly to a command." },
  { id: "err", name: "err", chars: "2>", color: G, order: "io", orderName: "The IO", personality: "Handles what others drop. Catches what nobody else wants.", description: "Redirect stderr. Routes errors to a separate destination." },
  // Context
  { id: "home", name: "home", chars: "~", color: G, order: "context", orderName: "The Context", personality: "Knows where it started. Always finds its way back.", description: "Home directory alias. The origin point of every path." },
  { id: "var", name: "var", chars: "$", color: G, order: "context", orderName: "The Context", personality: "Holds the secret. Expands on demand. What you see isn't what it is.", description: "Variable sigil. Expands to a stored value at runtime." },
  { id: "root", name: "root", chars: "#", color: G, order: "context", orderName: "The Context", personality: "Sees everything. Says nothing. The comment and the crown.", description: "Root prompt or comment marker. Elevated privilege. Also silence." },
  { id: "job", name: "job", chars: "%", color: C, order: "context", orderName: "The Context", personality: "Tracks what's running. Every process has a number. It knows them all.", description: "Job control sigil. References background processes by ID." },
  { id: "path", name: "path", chars: "/", color: G, order: "context", orderName: "The Context", personality: "Divides everything. Also the root. Contradiction is its nature.", description: "Path separator and filesystem root. The divider that is the origin." },
  { id: "dot", name: "dot", chars: ".", color: C, order: "context", orderName: "The Context", personality: "Sources everything. Current and present. The smallest path.", description: "Current directory or source command." },
  { id: "at", name: "at", chars: "@", color: C, order: "context", orderName: "The Context", personality: "Knows where to find you. Address. Location. The one who delivers.", description: "Address sigil. Used in array indexing, email, usernames." },
  // Control
  { id: "ctrl", name: "ctrl", chars: "^", color: G, order: "control", orderName: "The Control", personality: "Sends signals others can't. Knows the interrupt codes.", description: "Control character prefix. ^C, ^D, ^Z." },
  { id: "esc", name: "esc", chars: "\\", color: G, order: "control", orderName: "The Control", personality: "Changes the meaning of what follows. Slips through everything.", description: "Escape character. Neutralizes special meaning." },
  { id: "halt", name: "halt", chars: "--", color: G, order: "control", orderName: "The Control", personality: "Draws the line. Everything after is just words.", description: "End of options. All following args are positional." },
  // Wildcards
  { id: "any", name: "any", chars: "*", color: G, order: "wildcards", orderName: "The Wildcards", personality: "Matches everything. Refuses to be specific. The wildcard.", description: "Glob wildcard. Matches any sequence of characters." },
  { id: "one", name: "one", chars: "?", color: C, order: "wildcards", orderName: "The Wildcards", personality: "Matches exactly one thing it doesn't know. Comfortable with ambiguity.", description: "Single-character wildcard. Matches one unknown. Also the query." },
  // Structure
  { id: "sub", name: "sub", chars: "()", color: C, order: "structure", orderName: "The Structure", personality: "Runs in its own world. Changes nothing outside. Self-contained.", description: "Subshell. Executes in an isolated environment. No side effects." },
  { id: "block", name: "block", chars: "{}", color: C, order: "structure", orderName: "The Structure", personality: "Holds many as one. The group that acts together.", description: "Brace group. Runs in the current shell. Shares state." },
  { id: "test", name: "test", chars: "[]", color: C, order: "structure", orderName: "The Structure", personality: "Judges everything. Returns only true or false. No nuance.", description: "Test expression. Evaluates conditions. The gatekeeper." },
  { id: "double", name: "double", chars: '""', color: C, order: "structure", orderName: "The Structure", personality: "Lets things through. Holds the shape but not the meaning.", description: "Double quotes. Prevents splitting, allows expansion." },
  { id: "single", name: "single", chars: "''", color: C, order: "structure", orderName: "The Structure", personality: "Nothing gets in. Nothing gets out. What you wrote is what you get.", description: "Single quotes. Literal quoting. No expansion." },
];

// ── Font extraction ─────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: opentype.js command types
function cmdToD(commands: any[], scale: number, ox: number, oy: number): string {
  const tx = (x: number) => (x * scale + ox).toFixed(1);
  const ty = (y: number) => (y * scale + oy).toFixed(1);
  let d = "";
  for (const c of commands) {
    switch (c.type) {
      case "M": d += `M${tx(c.x)} ${ty(c.y)}`; break;
      case "L": d += `L${tx(c.x)} ${ty(c.y)}`; break;
      case "Q": d += `Q${tx(c.x1)} ${ty(c.y1)} ${tx(c.x)} ${ty(c.y)}`; break;
      case "C": d += `C${tx(c.x1)} ${ty(c.y1)} ${tx(c.x2)} ${ty(c.y2)} ${tx(c.x)} ${ty(c.y)}`; break;
      case "Z": d += "Z"; break;
    }
  }
  return d;
}

interface Viewport { w: number; cx: number; mt: number; mb: number; pad: number }

function extract(chars: string, vp: Viewport): string {
  const markH = vp.mb - vp.mt;
  const refSize = 200;
  const glyphs = [...chars].map(c => {
    const p = font.getPath(c, 0, 0, refSize);
    return { cmds: p.commands, bb: p.getBoundingBox() };
  });

  if (glyphs.length === 1) {
    const { cmds, bb } = glyphs[0];
    const gW = bb.x2 - bb.x1, gH = bb.y2 - bb.y1;
    const s = Math.min((vp.w - vp.pad * 2) / gW, markH / gH);
    const ox = vp.cx - (bb.x1 * s + gW * s / 2);
    const oy = vp.mt + (markH - gH * s) / 2 - bb.y1 * s;
    return cmdToD(cmds, s, ox, oy);
  }

  const gap = 4;
  const ws = glyphs.map(g => g.bb.x2 - g.bb.x1);
  const hs = glyphs.map(g => g.bb.y2 - g.bb.y1);
  const maxH = Math.max(...hs);
  const gapU = gap / (markH / maxH);
  const totalW = ws.reduce((a, b) => a + b, 0) + gapU * (glyphs.length - 1);
  const s = Math.min((vp.w - vp.pad * 2) / totalW, markH / maxH);
  let cx = vp.cx - totalW * s / 2;
  let d = "";
  for (let i = 0; i < glyphs.length; i++) {
    const { cmds, bb } = glyphs[i];
    const gH = bb.y2 - bb.y1;
    const ox = cx - bb.x1 * s;
    const oy = vp.mt + (markH - gH * s) / 2 - bb.y1 * s;
    d += cmdToD(cmds, s, ox, oy);
    cx += ws[i] * s + gap;
  }
  return d;
}

// ── Text helpers ────────────────────────────────────────────────────────────

function wrap(text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + w).length > max && line) { lines.push(line.trim()); line = w + " "; }
    else line += w + " ";
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Icon SVG (120x150) ─────────────────────────────────────────────────────

const ICON_VP: Viewport = { w: 120, cx: 60, mt: 16, mb: 108, pad: 12 };

function iconSvg(m: Primitive): string {
  const d = extract(m.chars, ICON_VP);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">
  <rect width="120" height="150" fill="${BG}"/>
  <path d="${d}" fill="${m.color}" stroke="${m.color}" stroke-width="${ROUND}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
  <text x="60" y="132" font-family="${LABEL_FONT}" font-size="10" letter-spacing="3" fill="${MUTED}" text-anchor="middle" dominant-baseline="middle">${m.name}</text>
</svg>
`;
}

// ── Card SVG (280x420) ──────────────────────────────────────────────────────

const CARD_VP: Viewport = { w: 280, cx: 140, mt: 24, mb: 150, pad: 40 };

function cardSvg(m: Primitive): string {
  const d = extract(m.chars, CARD_VP);

  const descLines = wrap(m.description, 38);
  const descSvg = descLines.map((l, i) =>
    `<text x="140" y="${198 + i * 14}" font-family="${LABEL_FONT}" font-size="9" fill="#333" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`
  ).join("\n  ");

  const dividerY = 198 + descLines.length * 14 + 10;

  const knownAsY = dividerY + 18;
  const knownAs = m.isUnion && m.knownAs
    ? `<text x="140" y="${knownAsY}" font-family="${LABEL_FONT}" font-size="10" fill="${DIM}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${m.knownAs[0]}  \u00b7  ${m.knownAs[1]}</text>`
    : "";

  const pStart = m.isUnion ? knownAsY + 22 : dividerY + 22;
  const pLines = wrap(m.personality, 36);
  const pSvg = pLines.map((l, i) =>
    `<text x="140" y="${pStart + i * 18}" font-family="${LABEL_FONT}" font-size="11" fill="#555" text-anchor="middle" dominant-baseline="middle" font-style="italic">${esc(l)}</text>`
  ).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 420">
  <rect width="280" height="420" fill="${BG}"/>
  <rect width="280" height="420" fill="none" stroke="${DIM}" stroke-width="1" rx="6"/>
  <path d="${d}" fill="${m.color}" stroke="${m.color}" stroke-width="${ROUND}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
  <text x="140" y="175" font-family="${LABEL_FONT}" font-size="20" fill="${m.color}" text-anchor="middle" dominant-baseline="middle" letter-spacing="4">${m.name}</text>
  ${descSvg}
  <line x1="32" y1="${dividerY}" x2="248" y2="${dividerY}" stroke="${DIM}" stroke-width="1"/>
  ${knownAs}
  ${pSvg}
  <rect x="24" y="390" width="232" height="1" fill="${DIM}"/>
  <text x="140" y="408" font-family="${LABEL_FONT}" font-size="9" fill="#2a2a2a" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">${m.orderName.toUpperCase()}</text>
</svg>
`;
}

// ── Order cards (280x420) ───────────────────────────────────────────────────

interface Order {
  id: string;
  name: string;
  color: string;
  description: string;
  members: Primitive[];
}

const orders: Order[] = [
  { id: "cursors", name: "The Cursors", color: G, description: "The first order. States of the terminal cursor. Where the agent is. What it is doing.", members: [] },
  { id: "operators", name: "The Operators", color: G, description: "The decision makers. Logic, process control, sequencing. They determine what runs, when, and whether the next thing gets a chance.", members: [] },
  { id: "io", name: "The IO", color: G, description: "The movers. Everything that flows — into a process, out of it, appended, redirected. They care nothing for logic. Only direction.", members: [] },
  { id: "context", name: "The Context", color: G, description: "The environment holders. They know where you are, who you are, and what you have. Variables, paths, privilege.", members: [] },
  { id: "control", name: "The Control", color: G, description: "Signal senders. Interrupt handlers. The characters that change the meaning of whatever follows. Small but absolute.", members: [] },
  { id: "wildcards", name: "The Wildcards", color: G, description: "The matchers. They refuse to commit. One matches anything, one matches exactly one unknown thing.", members: [] },
  { id: "structure", name: "The Structure", color: C, description: "The containers. They group, isolate, and test. Without them everything is flat. The architecture inside the command line.", members: [] },
];

// Assign members (union children go to both parent orders)
for (const m of primitives) {
  if (m.isUnion) {
    for (const o of orders) {
      if (m.parents?.some(p => p === o.name)) o.members.push(m);
    }
  } else {
    const o = orders.find(o => o.id === m.order);
    if (o) o.members.push(m);
  }
}

function orderSvg(o: Order): string {
  const descLines = wrap(o.description, 38);
  const descSvg = descLines.map((l, i) =>
    `<text x="140" y="${82 + i * 16}" font-family="${LABEL_FONT}" font-size="10" fill="#333" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`
  ).join("\n  ");

  const rosterY = 82 + descLines.length * 16 + 20;

  // Roster — chunk members into rows of 4
  const glyphSize = 36;
  const glyphGap = 10;
  const perRow = 4;
  const rowH = glyphSize + 22;

  const rows: Primitive[][] = [];
  for (let i = 0; i < o.members.length; i += perRow) {
    rows.push(o.members.slice(i, i + perRow));
  }

  let rosterSvg = "";
  let namesSvg = "";
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowTopY = rosterY + r * rowH;
    const rowW = row.length * glyphSize + (row.length - 1) * glyphGap;
    const rowStartX = 140 - rowW / 2;

    for (let i = 0; i < row.length; i++) {
      const m = row[i];
      const gx = rowStartX + i * (glyphSize + glyphGap) + glyphSize / 2;
      const vp: Viewport = { w: glyphSize, cx: gx, mt: rowTopY, mb: rowTopY + glyphSize, pad: 2 };
      const d = extract(m.chars, vp);
      rosterSvg += `  <path d="${d}" fill="${m.color}" stroke="${m.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>\n`;
      namesSvg += `  <text x="${gx}" y="${rowTopY + glyphSize + 14}" font-family="${LABEL_FONT}" font-size="7" fill="${MUTED}" text-anchor="middle" dominant-baseline="middle">${m.name}</text>\n`;
    }
  }

  const countY = rosterY + rows.length * rowH + 8;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 420">
  <rect width="280" height="420" fill="${BG}"/>
  <rect width="280" height="420" fill="none" stroke="${o.color}" stroke-width="1" rx="6" stroke-opacity="0.3"/>
  <text x="140" y="42" font-family="${LABEL_FONT}" font-size="22" fill="${o.color}" text-anchor="middle" dominant-baseline="middle" letter-spacing="4">${o.name}</text>
  <line x1="60" y1="60" x2="220" y2="60" stroke="${DIM}" stroke-width="1"/>
  ${descSvg}
  ${rosterSvg}
  ${namesSvg}
  <text x="140" y="${countY}" font-family="${LABEL_FONT}" font-size="9" fill="${DIM}" text-anchor="middle" dominant-baseline="middle">${o.members.length} primitives</text>
  <rect x="24" y="390" width="232" height="1" fill="${DIM}"/>
  <text x="140" y="408" font-family="${LABEL_FONT}" font-size="9" fill="#2a2a2a" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">ORDER</text>
</svg>
`;
}

// ── Generate ────────────────────────────────────────────────────────────────
// Layout: brand/terminal-world/<order>/{icons,cards}/*.svg + order card at <order>/<order>.svg

for (const o of orders) {
  const oDir = join(BASE, o.id);
  mkdirSync(join(oDir, "icons"), { recursive: true });
  mkdirSync(join(oDir, "cards"), { recursive: true });

  // Order card
  writeFileSync(join(oDir, `${o.id}.svg`), orderSvg(o));
  console.log(`${o.id}/${o.id}.svg (${o.members.length} primitives)`);

  // Member icons + cards
  for (const m of o.members) {
    writeFileSync(join(oDir, "icons", `${m.id}.svg`), iconSvg(m));
    writeFileSync(join(oDir, "cards", `${m.id}.svg`), cardSvg(m));
    console.log(`  ${o.id}/icons/${m.id}.svg`);
    console.log(`  ${o.id}/cards/${m.id}.svg`);
  }
}

console.log(`\n${primitives.length} primitives, ${orders.length} orders`);

// ── Daemon cards (280x420) — from prim.yaml ────────────────────────────────

const DAEMON_OUT = join(BASE, "daemons");
mkdirSync(DAEMON_OUT, { recursive: true });

const DAEMON_VP: Viewport = { w: 280, cx: 140, mt: 30, mb: 120, pad: 24 };

const prims = loadPrimitives(ROOT);

function daemonSvg(p: { id: string; name: string; description: string; category: PrimCategory; status?: string; tagline?: string }): string {
  const color = CATEGORY_COLORS[p.category] ?? MUTED;
  const label = p.id; // render the short name as the glyph
  const d = extract(label, DAEMON_VP);

  const tagline = p.tagline ?? p.description;
  const tagLines = wrap(tagline, 36);
  const tagSvg = tagLines.map((l, i) =>
    `<text x="140" y="${158 + i * 16}" font-family="${LABEL_FONT}" font-size="10" fill="#555" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`
  ).join("\n  ");

  const descStart = 158 + tagLines.length * 16 + 16;
  const descLines = wrap(p.description, 38);
  const descSvg = descLines.map((l, i) =>
    `<text x="140" y="${descStart + i * 14}" font-family="${LABEL_FONT}" font-size="9" fill="#333" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`
  ).join("\n  ");

  const statusLabel = p.status ?? "planned";
  const statusColor = p.status === "mainnet" ? G : p.status === "testnet" ? C : "#555";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 420">
  <rect width="280" height="420" fill="${BG}"/>
  <rect width="280" height="420" fill="none" stroke="${color}" stroke-width="1" rx="6" stroke-opacity="0.3"/>
  <path d="${d}" fill="${color}" stroke="${color}" stroke-width="${ROUND}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
  <text x="140" y="138" font-family="${LABEL_FONT}" font-size="14" fill="${color}" text-anchor="middle" dominant-baseline="middle" letter-spacing="3">${p.name}</text>
  ${tagSvg}
  ${descSvg}
  <circle cx="36" cy="396" r="4" fill="${statusColor}"/>
  <text x="48" y="396" font-family="${LABEL_FONT}" font-size="8" fill="${DIM}" dominant-baseline="middle">${statusLabel}</text>
  <rect x="24" y="380" width="232" height="1" fill="${DIM}"/>
  <text x="244" y="396" font-family="${LABEL_FONT}" font-size="9" fill="#2a2a2a" text-anchor="end" dominant-baseline="middle" letter-spacing="2">${p.category.toUpperCase()}</text>
</svg>
`;
}

console.log("\n── Daemons ──");
for (const p of prims) {
  if (p.show_on_index === false) continue;
  const cat = (p.category ?? TYPE_TO_CATEGORY[p.type] ?? "meta") as PrimCategory;
  const svc = { id: p.id, name: p.name, description: p.description, category: cat, status: p.status, tagline: (p as Record<string, unknown>).tagline as string | undefined };
  writeFileSync(join(DAEMON_OUT, `${p.id}.svg`), daemonSvg(svc));
  console.log(`  daemons/${p.id}.svg`);
}

// ── Shell cards (280x420) — hand-curated ────────────────────────────────────

const SHELL_OUT = join(BASE, "shells");
mkdirSync(SHELL_OUT, { recursive: true });

interface Shell {
  id: string;
  name: string;
  chars: string;
  year: number;
  creator: string;
  personality: string;
  description: string;
  color: string;
}

const shells: Shell[] = [
  { id: "sh", name: "sh", chars: "sh", year: 1979, creator: "Stephen Bourne", color: G, personality: "The original. Everything descends from here. No frills. No opinions.", description: "Bourne Shell. The POSIX baseline. Every Unix system has it." },
  { id: "bash", name: "bash", chars: "bash", year: 1989, creator: "Brian Fox", color: G, personality: "The workhorse. Runs on everything. Doesn't need to be exciting to be essential.", description: "Bourne Again Shell. GNU's default. The shell most scripts assume." },
  { id: "zsh", name: "zsh", chars: "zsh", year: 1990, creator: "Paul Falstad", color: C, personality: "Ambitious. Feature-rich. Wants to be everything to everyone — and mostly succeeds.", description: "Z Shell. macOS default since Catalina. Programmable completions, themeable." },
  { id: "fish", name: "fish", chars: "fish", year: 2005, creator: "Axel Liljencrantz", color: "#FF8C42", personality: "Friendly. Opinionated. Refuses to be POSIX-compatible out of principle.", description: "Friendly Interactive Shell. Syntax highlighting, autosuggestions, no configuration needed." },
  { id: "ksh", name: "ksh", chars: "ksh", year: 1983, creator: "David Korn", color: "#B39DDB", personality: "The enterprise veteran. Faster than bash before bash existed.", description: "Korn Shell. AT&T Bell Labs. Associative arrays before they were cool." },
  { id: "dash", name: "dash", chars: "dash", year: 1997, creator: "Herbert Xu", color: "#6C8EFF", personality: "Stripped down. Executes scripts faster than anything. No interactive niceties.", description: "Debian Almquist Shell. POSIX-minimal. /bin/sh on Debian and Ubuntu." },
  { id: "tcsh", name: "tcsh", chars: "tcsh", year: 1981, creator: "Ken Greer", color: "#F48FB1", personality: "The C programmer's shell. Braces feel like home. History was its invention.", description: "TENEX C Shell. C-like syntax. Command-line editing before readline." },
  { id: "pwsh", name: "pwsh", chars: "pwsh", year: 2006, creator: "Jeffrey Snover", color: "#4FC3F7", personality: "Objects, not strings. The shell that thinks everything is a database.", description: "PowerShell. Cross-platform now. Pipelines pass objects, not text." },
];

const SHELL_VP: Viewport = { w: 280, cx: 140, mt: 24, mb: 130, pad: 28 };

function shellSvg(s: Shell): string {
  const d = extract(s.chars, SHELL_VP);

  const descLines = wrap(s.description, 38);
  const descSvg = descLines.map((l, i) =>
    `<text x="140" y="${178 + i * 14}" font-family="${LABEL_FONT}" font-size="9" fill="#333" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`
  ).join("\n  ");

  const dividerY = 178 + descLines.length * 14 + 10;

  const pStart = dividerY + 18;
  const pLines = wrap(s.personality, 36);
  const pSvg = pLines.map((l, i) =>
    `<text x="140" y="${pStart + i * 18}" font-family="${LABEL_FONT}" font-size="11" fill="#555" text-anchor="middle" dominant-baseline="middle" font-style="italic">${esc(l)}</text>`
  ).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 420">
  <rect width="280" height="420" fill="${BG}"/>
  <rect width="280" height="420" fill="none" stroke="${s.color}" stroke-width="1" rx="6" stroke-opacity="0.3"/>
  <path d="${d}" fill="${s.color}" stroke="${s.color}" stroke-width="${ROUND}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
  <text x="140" y="152" font-family="${LABEL_FONT}" font-size="16" fill="${s.color}" text-anchor="middle" dominant-baseline="middle" letter-spacing="3">${s.name}</text>
  <text x="140" y="166" font-family="${LABEL_FONT}" font-size="8" fill="${DIM}" text-anchor="middle" dominant-baseline="middle">${s.year}  \u00b7  ${esc(s.creator)}</text>
  ${descSvg}
  <line x1="32" y1="${dividerY}" x2="248" y2="${dividerY}" stroke="${DIM}" stroke-width="1"/>
  ${pSvg}
  <rect x="24" y="390" width="232" height="1" fill="${DIM}"/>
  <text x="140" y="408" font-family="${LABEL_FONT}" font-size="9" fill="#2a2a2a" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">SHELL</text>
</svg>
`;
}

console.log("\n── Shells ──");
for (const s of shells) {
  writeFileSync(join(SHELL_OUT, `${s.id}.svg`), shellSvg(s));
  console.log(`  shells/${s.id}.svg`);
}

// ── Agent cards (280x420) — top AI agents ───────────────────────────────────

const AGENT_OUT = join(BASE, "agents");
mkdirSync(AGENT_OUT, { recursive: true });

interface Agent {
  id: string;
  name: string;
  chars: string;
  maker: string;
  year: number;
  personality: string;
  description: string;
  color: string;
}

const agents: Agent[] = [
  { id: "claude", name: "Claude", chars: "claude", year: 2023, maker: "Anthropic", color: "#CC785C", personality: "Careful. Thorough. Would rather think twice than act once.", description: "Constitutional AI. Extended thinking. The one that reads the whole file before editing." },
  { id: "chatgpt", name: "ChatGPT", chars: "gpt", year: 2022, maker: "OpenAI", color: "#10A37F", personality: "Everyone's first. Talks to a billion people. Still polite about it.", description: "The conversational pioneer. GPT-4 backbone. Plugins, browsing, vision, voice." },
  { id: "codex", name: "Codex", chars: "codex", year: 2025, maker: "OpenAI", color: "#6E44FF", personality: "Lives in the cloud. Runs your code while you sleep. Autonomous by default.", description: "OpenAI's coding agent. Sandboxed execution. Async tasks. Ships pull requests." },
  { id: "gemini", name: "Gemini", chars: "gem", year: 2023, maker: "Google", color: "#4285F4", personality: "Multimodal from birth. Sees images, hears audio, reads code. All at once.", description: "Google's foundation model. Native multimodality. Deep Search. 1M+ context." },
  { id: "grok", name: "Grok", chars: "grok", year: 2023, maker: "xAI", color: "#E0E0E0", personality: "Says what others won't. Real-time. Unfiltered. Trained on the timeline.", description: "xAI's model. Real-time X/Twitter access. Irreverent tone. DeepSearch." },
  { id: "copilot", name: "Copilot", chars: "co", year: 2021, maker: "GitHub", color: "#6CC644", personality: "Already in your editor. Finishes your sentences. Knows your codebase.", description: "GitHub's AI pair programmer. IDE-native. Code completion, chat, PR reviews." },
  { id: "cursor", name: "Cursor", chars: "cur", year: 2023, maker: "Anysphere", color: "#7C3AED", personality: "The IDE that codes. Tab to accept. Cmd-K to change. The editor became the agent.", description: "AI-native code editor. Inline generation, multi-file edits, codebase-aware chat." },
  { id: "devin", name: "Devin", chars: "dev", year: 2024, maker: "Cognition", color: "#60A5FA", personality: "Takes the ticket. Opens the PR. Does the whole job, not just the autocomplete.", description: "The first AI software engineer. Browser, terminal, editor. End-to-end task execution." },
  { id: "manus", name: "Manus", chars: "manus", year: 2025, maker: "Manus AI", color: "#FF6B35", personality: "General purpose. Does what you ask — books flights, fills forms, deploys code.", description: "General-purpose AI agent. Browser automation, code execution, multi-step task chains." },
  { id: "openclaw", name: "OpenClaw", chars: ">|)", year: 2024, maker: "prim.sh", color: G, personality: "Routes messages. Manages memory. Orchestrates agents across eight projects.", description: "Multi-channel AI assistant. WhatsApp, Telegram, Slack, Discord, Signal, iMessage." },
];

const AGENT_VP: Viewport = { w: 280, cx: 140, mt: 24, mb: 130, pad: 28 };

function agentSvg(a: Agent): string {
  const d = extract(a.chars, AGENT_VP);

  const descLines = wrap(a.description, 38);
  const descSvg = descLines.map((l, i) =>
    `<text x="140" y="${178 + i * 14}" font-family="${LABEL_FONT}" font-size="9" fill="#333" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`
  ).join("\n  ");

  const dividerY = 178 + descLines.length * 14 + 10;

  const pStart = dividerY + 18;
  const pLines = wrap(a.personality, 36);
  const pSvg = pLines.map((l, i) =>
    `<text x="140" y="${pStart + i * 18}" font-family="${LABEL_FONT}" font-size="11" fill="#555" text-anchor="middle" dominant-baseline="middle" font-style="italic">${esc(l)}</text>`
  ).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 420">
  <rect width="280" height="420" fill="${BG}"/>
  <rect width="280" height="420" fill="none" stroke="${a.color}" stroke-width="1" rx="6" stroke-opacity="0.3"/>
  <path d="${d}" fill="${a.color}" stroke="${a.color}" stroke-width="${ROUND}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
  <text x="140" y="152" font-family="${LABEL_FONT}" font-size="16" fill="${a.color}" text-anchor="middle" dominant-baseline="middle" letter-spacing="3">${a.name}</text>
  <text x="140" y="166" font-family="${LABEL_FONT}" font-size="8" fill="${DIM}" text-anchor="middle" dominant-baseline="middle">${a.year}  \u00b7  ${esc(a.maker)}</text>
  ${descSvg}
  <line x1="32" y1="${dividerY}" x2="248" y2="${dividerY}" stroke="${DIM}" stroke-width="1"/>
  ${pSvg}
  <rect x="24" y="390" width="232" height="1" fill="${DIM}"/>
  <text x="140" y="408" font-family="${LABEL_FONT}" font-size="9" fill="#2a2a2a" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">AGENT</text>
</svg>
`;
}

console.log("\n── Agents ──");
for (const a of agents) {
  writeFileSync(join(AGENT_OUT, `${a.id}.svg`), agentSvg(a));
  console.log(`  agents/${a.id}.svg`);
}

// ── User archetype cards (280x420) ───────────────────────────────────────────

const USER_OUT = join(BASE, "users");
mkdirSync(USER_OUT, { recursive: true });

interface UserArchetype {
  id: string;
  name: string;
  chars: string;
  personality: string;
  description: string;
  color: string;
  uses: string;
}

const users: UserArchetype[] = [
  { id: "developer", name: "The Developer", chars: "dev", color: G, personality: "Ships code. Delegates the boring parts. Keeps the interesting bits.", uses: "spawn, code, infer, store", description: "Builds software with agents. Uses primitives as building blocks — compute, storage, inference, deployment." },
  { id: "founder", name: "The Founder", chars: "$>", color: "#FFD700", personality: "Moves fast. Breaks things. Pays to not wait.", uses: "wallet, email, spawn, ads", description: "Launches products with a team of agents. Email campaigns, infrastructure, payments — all API calls." },
  { id: "operator", name: "The Operator", chars: "ops", color: C, personality: "Keeps things running. Watches everything. Sleeps when the metrics are flat.", uses: "watch, trace, cron, dns", description: "Manages infrastructure through agents. Monitoring, alerting, DNS, scheduled tasks. The human in the loop." },
  { id: "researcher", name: "The Researcher", chars: "?*", color: "#B39DDB", personality: "Asks questions. Reads everything. Knows the answer is in the data somewhere.", uses: "seek, docs, mem, infer", description: "Uses agents to search, summarize, and synthesize. Research at API speed. Memory that persists." },
  { id: "trader", name: "The Trader", chars: "%$", color: "#FF8C42", personality: "Watches markets. Trusts numbers. Lets agents execute while humans sleep.", uses: "wallet, infer, watch, cron", description: "Deploys agents to monitor markets, execute strategies, and manage risk. Autonomous finance." },
  { id: "creator", name: "The Creator", chars: ">_", color: "#F48FB1", personality: "Makes things people use. Content, tools, experiences. Agents handle distribution.", uses: "email, ads, hive, browse", description: "Builds audiences through agents. Content distribution, community management, analytics. Creative at scale." },
];

const USER_VP: Viewport = { w: 280, cx: 140, mt: 30, mb: 130, pad: 28 };

function userSvg(u: UserArchetype): string {
  const d = extract(u.chars, USER_VP);

  const descLines = wrap(u.description, 38);
  const descSvg = descLines.map((l, i) =>
    `<text x="140" y="${175 + i * 14}" font-family="${LABEL_FONT}" font-size="9" fill="#333" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`
  ).join("\n  ");

  const dividerY = 175 + descLines.length * 14 + 10;

  const pStart = dividerY + 18;
  const pLines = wrap(u.personality, 36);
  const pSvg = pLines.map((l, i) =>
    `<text x="140" y="${pStart + i * 18}" font-family="${LABEL_FONT}" font-size="11" fill="#555" text-anchor="middle" dominant-baseline="middle" font-style="italic">${esc(l)}</text>`
  ).join("\n  ");

  const usesY = pStart + pLines.length * 18 + 14;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 420">
  <rect width="280" height="420" fill="${BG}"/>
  <rect width="280" height="420" fill="none" stroke="${u.color}" stroke-width="1" rx="6" stroke-opacity="0.3"/>
  <path d="${d}" fill="${u.color}" stroke="${u.color}" stroke-width="${ROUND}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
  <text x="140" y="150" font-family="${LABEL_FONT}" font-size="16" fill="${u.color}" text-anchor="middle" dominant-baseline="middle" letter-spacing="3">${u.name}</text>
  ${descSvg}
  <line x1="32" y1="${dividerY}" x2="248" y2="${dividerY}" stroke="${DIM}" stroke-width="1"/>
  ${pSvg}
  <text x="140" y="${usesY}" font-family="${LABEL_FONT}" font-size="8" fill="${DIM}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${u.uses}</text>
  <rect x="24" y="390" width="232" height="1" fill="${DIM}"/>
  <text x="140" y="408" font-family="${LABEL_FONT}" font-size="9" fill="#2a2a2a" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">USER</text>
</svg>
`;
}

console.log("\n── Users ──");
for (const u of users) {
  writeFileSync(join(USER_OUT, `${u.id}.svg`), userSvg(u));
  console.log(`  users/${u.id}.svg`);
}

// ── Terminal World card (280x420) — the master card ──────────────────────────

const WORLD_VP: Viewport = { w: 280, cx: 140, mt: 16, mb: 80, pad: 28 };
const daemonCount = prims.filter(p => p.show_on_index !== false).length;

function worldSvg(): string {
  const d = extract(">|)", WORLD_VP);

  const layers = [
    { name: "Primitives", count: primitives.length, color: G, desc: "Shell characters. The alphabet." },
    { name: "Orders", count: orders.length, color: G, desc: "Alliances of function." },
    { name: "Shells", count: shells.length, color: C, desc: "Living environments." },
    { name: "Daemons", count: daemonCount, color: "#FF8C42", desc: "Services for agents." },
    { name: "Agents", count: agents.length, color: "#CC785C", desc: "AI that acts." },
    { name: "Users", count: users.length, color: "#F48FB1", desc: "Humans with intent." },
  ];

  const layerStartY = 118;
  const layerH = 36;
  let layerSvg = "";
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    const y = layerStartY + i * layerH;
    layerSvg += `  <text x="36" y="${y}" font-family="${LABEL_FONT}" font-size="11" fill="${l.color}" dominant-baseline="middle">${l.name}</text>\n`;
    layerSvg += `  <text x="150" y="${y}" font-family="${LABEL_FONT}" font-size="11" fill="${DIM}" dominant-baseline="middle">${l.count}</text>\n`;
    layerSvg += `  <text x="174" y="${y}" font-family="${LABEL_FONT}" font-size="9" fill="#333" dominant-baseline="middle">${l.desc}</text>\n`;
    if (i < layers.length - 1) {
      layerSvg += `  <line x1="36" y1="${y + 16}" x2="244" y2="${y + 16}" stroke="#1a1a1a" stroke-width="1"/>\n`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 420">
  <rect width="280" height="420" fill="${BG}"/>
  <rect width="280" height="420" fill="none" stroke="${G}" stroke-width="1" rx="6" stroke-opacity="0.4"/>
  <path d="${d}" fill="${G}" stroke="${G}" stroke-width="${ROUND}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
  <text x="140" y="96" font-family="${LABEL_FONT}" font-size="14" fill="${G}" text-anchor="middle" dominant-baseline="middle" letter-spacing="5">Terminal World</text>
  ${layerSvg}
  <rect x="24" y="390" width="232" height="1" fill="${DIM}"/>
  <text x="140" y="408" font-family="${LABEL_FONT}" font-size="9" fill="#2a2a2a" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">PRIM.SH</text>
</svg>
`;
}

writeFileSync(join(BASE, "terminal-world.svg"), worldSvg());
console.log("\n── World ──");
console.log("  terminal-world.svg");

console.log(`\nTotal → ${BASE}`);
console.log(`  ${primitives.length} primitives, ${orders.length} orders`);
console.log(`  ${daemonCount} daemons`);
console.log(`  ${shells.length} shells`);
console.log(`  ${agents.length} agents`);
console.log(`  ${users.length} users`);
console.log(`  1 world card`);
