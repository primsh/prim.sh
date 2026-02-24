# P-1 — llms.txt Root + Per-Primitive Files

**Date:** 2026-02-24  
**Status:** Done  
**Task:** P-1  
**Scope:** Author static `llms.txt` docs only (no server routing changes)

All tasks in this plan have been completed:

- `site/llms.txt` created with grouped primitive links and x402 context.  
- Every `site/<primitive>/` directory now has an `llms.txt` file, including `site/agentstack/llms.txt`.  
- Auth wording is consistent across files: `Auth: x402 (USDC on Base, chain \`eip155:8453\`)`.  
- No `site/serve.py` edits were made in P-1.

The next step (P-2) is to wire these docs into `site/serve.py` so `/llms.txt` and `/<primitive>/llms.txt` are served over HTTP.

