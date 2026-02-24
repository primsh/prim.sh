# S-6 — "This page is for humans. The API is for agents."

**Date:** 2026-02-24  
**Status:** Done  
**Scope:** `site/*/index.html` (all primitive pages + `site/agentstack/index.html`)

---

This task added the line:

```html
<div style="margin-top:0.5rem;font-size:0.75rem;color:#444">This page is for humans. The API is for agents.</div>
```

to the footer of every landing page, immediately under the existing tagline, so humans are explicitly addressed while keeping the primary copy agent-focused.

All 28 files listed in the plan now include this line, and `python3 site/serve.py` serves the updated pages via the existing route map.

