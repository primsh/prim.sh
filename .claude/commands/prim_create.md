# prim_create

Create a new phantom prim from a one-line idea. No interactive prompts — interpret the user's input and make best guesses.

## Arguments

`$ARGUMENTS` — a short idea description. Examples:
- `"sms messaging for agents"`
- `"agent-to-agent RPC calls"`
- `"OCR and document parsing"`

## Instructions

From the user's idea in `$ARGUMENTS`, determine:

1. **id** — short lowercase slug (1-6 chars). Check existing `site/*/prim.yaml` and `packages/*/prim.yaml` to avoid collisions.
2. **name** — `{id}.sh`
3. **endpoint** — `{id}.prim.sh`
4. **type** — one-word type (e.g., messaging, scheduler, compute, storage, rpc, parsing)
5. **category** — one of: `crypto`, `compute`, `storage`, `comms`, `intelligence`, `identity`, `ops`, `physical`, `meta`
6. **description** — one sentence, ~80 chars, matches the voice of existing prims (terse, agent-focused, ends with a concrete benefit)
7. **tagline** — ultra-short version of description (~4-6 words)
8. **sub** — one sentence expanding on description, mentions x402 auth

## Output

Create the file `site/{id}/prim.yaml` with this exact format:

```yaml
id: {id}
name: {name}
endpoint: {endpoint}
status: phantom
type: {type}
category: {category}
card_class: p0
description: "{description}"
tagline: "{tagline}"
sub: "{sub}"
```

Notes:
- `card_class: p0` is a placeholder — it gets assigned when the prim is promoted to building/live
- `status: phantom` means it's a backlog idea, not yet scaffolded
- Do NOT create a `packages/` directory or run `pnpm create-prim` — this is just the YAML placeholder
- Do NOT run any generators after creating the file

After creating the file, confirm with: `Created site/{id}/prim.yaml (phantom)` and show the file contents.
