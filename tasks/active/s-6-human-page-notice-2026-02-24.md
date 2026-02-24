# S-6 — "This page is for humans. The API is for agents."

**Date:** 2026-02-24
**Status:** Active
**Scope:** `site/*/index.html` (all 27 primitive pages + `site/agentstack/index.html`)

---

## Context

The agentstack landing pages are the primary discovery surface for humans (investors, developers, curious people). The actual customers are agents, not humans. Task S-6 adds a single line to every page that acknowledges this duality: the page is for humans to read, but the product is for agents to use.

This line is different in tone from the existing footer taglines ("Agents don't have passports. They have payment receipts.") — those speak *about* agents. This new line speaks *to* the human reader.

---

## Goal

Add `This page is for humans. The API is for agents.` to all 28 landing pages (27 primitives + `agentstack/index.html`). `site/index.html` is a symlink and updates automatically.

---

## Placement

**Location:** Footer, as a second line below the existing primitive tagline div.

**Rationale:** The footer is low-friction and consistent. The existing tagline (`margin-top:0.75rem;font-size:0.8rem`) stays untouched. The new line goes immediately after it, smaller and dimmer to subordinate it visually.

**HTML to add** (one line, after the existing tagline div in every footer):
```html
<div style="margin-top:0.5rem;font-size:0.75rem;color:#444">This page is for humans. The API is for agents.</div>
```

---

## Files to Modify

All files under `site/` with a `<footer>` block. Confirmed list:

```
site/agentstack/index.html
site/ads/index.html
site/auth/index.html
site/browse/index.html
site/code/index.html
site/corp/index.html
site/cron/index.html
site/dns/index.html
site/docs/index.html
site/hands/index.html
site/hive/index.html
site/id/index.html
site/infer/index.html
site/mart/index.html
site/mem/index.html
site/pay/index.html
site/pins/index.html
site/pipe/index.html
site/relay/index.html
site/ring/index.html
site/seek/index.html
site/ship/index.html
site/spawn/index.html
site/store/index.html
site/trace/index.html
site/vault/index.html
site/wallet/index.html
site/watch/index.html
```

`site/index.html` is a symlink to `site/agentstack/index.html` — no separate edit needed.

---

## Footer Structure Reference

Most primitive pages follow this pattern:
```html
<footer>
  <div>spawn.sh — agent-native infrastructure</div>
  <div class="links">...</div>
  <div style="margin-top:0.75rem;font-size:0.8rem">Agents don't have passports. They have payment receipts.</div>
  <!-- ADD HERE -->
</footer>
```

`site/agentstack/index.html` has a longer footer with many nav links, but same trailing structure — add after the last `<div style="margin-top:0.75rem...">` line.

---

## Design Decisions

- **Color `#444`** — dimmer than `--muted` (`#666`) to visually subordinate this meta-note below the tagline. It's informational, not part of the brand voice.
- **Font size `0.75rem`** — one step smaller than the tagline (`0.85rem`) to reinforce hierarchy.
- **Not in hero** — hero is agent-facing copy. Footer is the right place for a human-addressed parenthetical.
- **Not replacing** the existing tagline — the taglines are distinct brand copy. This line is additive.

---

## Testing

- Load each route in the browser via `python3 site/serve.py` and visually confirm the line appears in the footer on every page.
- Exact assertion: the string `This page is for humans. The API is for agents.` appears in the rendered footer of each of the 28 files listed above.
- `site/index.html` (symlink) should show it automatically without a separate edit.

---

## Before Closing

- [ ] Confirm all 28 files in the list above were edited (not just a subset)
- [ ] Verify `site/index.html` (symlink) shows the line without a direct edit
- [ ] Visually spot-check at least 3 pages in the browser
- [ ] No existing tagline was modified or removed
- [ ] `git diff --stat` shows exactly 28 files changed (27 primitives + agentstack)
