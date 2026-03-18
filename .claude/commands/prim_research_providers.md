# prim_research_providers

Research and score providers for a primitive, optionally auto-selecting the best one.

## Arguments

`$ARGUMENTS` — format: `<prim_id> [--auto-select]`. Examples:
- `"ring"` — research and display ranked table
- `"ring --auto-select"` — research, pick best, write to prim.yaml

## Instructions

From the arguments, extract `prim_id` and whether `--auto-select` is set.

### 1. Find the prim

Check `packages/{prim_id}/prim.yaml` first, then `site/{prim_id}/prim.yaml`. Read `type` and `description` fields.

### 2. Research providers

Use web search to find REST API providers for this prim's capability. Search for:
- `"{type} API"`, `"{type} REST API provider"`, `"{type} developer API"`
- Known providers from your training data

For each candidate, determine:
- **Name** and **URL** (API docs page)
- **Signup**: `self-service` (instant API key) / `manual` (approval required) / `sales-only`
- **PAYG**: `yes` (pay-as-you-go) / `no` (monthly minimum or annual contract)
- **Free tier**: What's included (e.g., "$15 trial credit", "1000 calls/mo", "none")
- **Sandbox**: `sandbox` (full sandbox env) / `test-credentials` (test mode) / `none`
- **Auth**: `api-key` / `oauth2` / `hmac` / other
- **Notes**: One-line summary of strengths/weaknesses

### 3. Score each provider

| Criterion | Scoring |
|-----------|---------|
| REST API exists | No REST API = disqualified (score 0) |
| Self-service signup | self-service = 20, manual = 5, sales-only = 0 |
| Pay-as-you-go | PAYG = 15, free-tier-only = 10, monthly-min = 5, annual = 0 |
| Free tier | >1000 calls/mo = 15, >100 = 10, trial credit = 5, none = 0 |
| API docs quality | OpenAPI spec = 15, good docs = 10, minimal = 5 |
| Sandbox/test mode | sandbox = 10, test creds = 7, none = 0 |
| Auth simplicity | API key = 10, OAuth2 = 5, HMAC/custom = 2 |
| Pricing transparency | published per-call = 10, calculator = 5, "contact us" = 0 |

If no provider offers self-service signup, flag: `⚠ No self-service providers found for <prim>.sh`

### 4. Output ranked table

```
<prim>.sh provider candidates:
┌──┬──────────┬────────┬──────┬──────────┬──────────┬─────┬────────────────────────┐
│# │ Provider │ Signup │ PAYG │ Free tier│ Sandbox  │Score│ Notes                  │
├──┼──────────┼────────┼──────┼──────────┼──────────┼─────┼────────────────────────┤
│1 │ ...      │ ...    │ ...  │ ...      │ ...      │  92 │ ...                    │
└──┴──────────┴────────┴──────┴──────────┴──────────┴─────┴────────────────────────┘
```

### 5. If `--auto-select`

Pick the highest-scoring provider and write to prim.yaml:

```yaml
providers:
  - name: <provider-name>
    env: [<ENV_VAR_1>, <ENV_VAR_2>]
    status: active
    default: true
    url: <api-docs-url>
    signup: <self-service|manual|sales-only>
    pricing_model: <payg|monthly|annual|free>
    sandbox: <sandbox|test-credentials|none>
    sandbox_note: "<how to get test credentials>"
```

Output: `Auto-selected: <name> (score <N>). Why: <one-sentence reasoning>.`

### 6. If NO `--auto-select`

Just output the table. The user will choose.
