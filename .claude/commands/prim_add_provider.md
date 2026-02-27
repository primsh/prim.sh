# prim_add_provider

Add a planned provider to a phantom or building prim.

## Arguments

`$ARGUMENTS` — format: `<prim_id> <provider_name>`. Examples:
- `"auth github-apps"`
- `"ring twilio"`
- `"browse browserbase"`

## Instructions

From the arguments, extract `prim_id` and `provider_name`.

1. Find the prim.yaml — check `site/{prim_id}/prim.yaml` first, then `packages/{prim_id}/prim.yaml`.
2. If prim.yaml not found, error: `No prim.yaml found for {prim_id}`.
3. Read the existing prim.yaml.
4. If a `providers` section exists, check for duplicates. If `provider_name` already exists, say so and stop.
5. Determine `url` — use your knowledge of the provider's API docs URL. If unknown, use `""`.
6. Determine `status`:
   - If prim status is `phantom` or `planning`: provider status is `planned`
   - If prim status is `building` or `testing` or `live`: provider status is `active`
7. Append the new provider to the `providers` list. If no `providers` section exists, create one.

## Output format

Confirm with: `Added {provider_name} to {prim_id}.sh providers ({status})`
