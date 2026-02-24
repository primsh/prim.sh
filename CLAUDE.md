# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Static marketing site for **agentstack** — an agent-native cloud platform offering 19 infrastructure primitives (spawn, store, vault, dns, relay, ring, cron, pipe, pay, docs, pins, seek, mart, hive, ads, ship, hands, id, corp). Each primitive has its own subdirectory with a single `index.html`.

## Running Locally

```bash
python serve.py
# Serves on 100.91.44.60:8892
# Routes: / → agentstack/index.html, /spawn → spawn/index.html, etc.
```

No build step. No dependencies. Edit HTML directly.

## Architecture

- **Zero JS, zero external deps.** Every page is a self-contained HTML file with inlined CSS.
- **`serve.py`** — Minimal Python HTTP server with a route map. All 19 primitives + root are defined in `ROUTES`.
- **`agentstack/index.html`** — Hub landing page listing all 19 primitives.
- **`index.html` (root)** — Duplicate of `agentstack/index.html`.
- **Each `<primitive>/index.html`** — Standalone product page with hero, API examples, pricing, CTA.

## Design System

All pages share a dark-mode design system via CSS custom properties:

- `--bg: #0a0a0a`, `--surface: #111`, `--border: #1a1a1a`, `--text: #e0e0e0`, `--muted: #666`
- Font: `'SF Mono', SFMono-Regular, 'Cascadia Code', Consolas, monospace`
- Each primitive page sets `--accent` to its unique color (green for spawn, gold for pay, etc.)
- The landing page assigns 19 named color variables (`--green` through `--slate`) and maps them to `.product.p1` through `.product.p19`

**Color utility classes** in code blocks: `.g` (green), `.b` (blue), `.r` (red), `.p` (purple), `.o` (orange), `.cy` (cyan), `.y` (yellow), `.pk` (pink), `.gl` (gold), `.t` (teal), `.m` (muted/magenta), `.l` (lime), `.c` (coral — but see known bug), `.i` (indigo), `.v` (violet), `.z` (azure), `.br` (brown), `.e` (emerald), `.s` (slate), `.w` (text/white).

## Page Template Pattern

Every primitive page follows this structure:
1. Hero — logo, tagline, curl example, feature badges
2. How it works — HTTP flow diagram (request → 402 → payment → 201)
3. Interfaces — REST / MCP / OpenAI function spec cards
4. API reference — endpoint listing in `<pre><code>` blocks
5. Use cases grid
6. x402 payment explanation
7. Pricing table
8. CTA + footer

Responsive breakpoint at 600px. Single-column on mobile.

## Known Issues

Tracked in `TASKS.md`:

1. **"Fourteen primitives" copy error** — Should be "Nineteen". Appears in the manifesto section and CTA of `agentstack/index.html`.
2. **`.c` class collision** — In `agentstack/index.html`, `.c{color:var(--coral)}` (line 49) is overridden by `.c{color:#444}` (line 50), so coral-intended elements render gray.

## Not a Git Repo

This project has no `.git/` directory and no version control configured.
