# Agent Integration Guide

Four ways to integrate prim into an agent: SDK, CLI subprocess, MCP server, and function-calling tools.

## SDK (recommended)

The TypeScript SDK provides typed clients for every primitive. It's the safest and most ergonomic option for programmatic use.

```bash
npm install @primsh/sdk @primsh/x402-client
```

```typescript
import { createPrimFetch } from "@primsh/x402-client";
import { createStoreClient } from "@primsh/sdk";

const primFetch = createPrimFetch({ privateKey: process.env.AGENT_PRIVATE_KEY });
const store = createStoreClient(primFetch, "https://store.prim.sh");

const { bucket } = await store.createBucket({ name: "my-data" });
console.log(bucket.id);
```

Each primitive has a `create<Name>Client()` factory: `createStoreClient`, `createSpawnClient`, `createEmailClient`, `createInferClient`, `createMemClient`, etc.

## CLI subprocess

When a full SDK isn't available (e.g. Python agents, shell scripts), spawn the `prim` CLI as a subprocess.

### Safe patterns

**Node.js** — use `execFileSync` with array arguments:

```typescript
import { execFileSync } from "node:child_process";

// SAFE: arguments are passed as an array, never concatenated into a shell string
const result = execFileSync("prim", ["store", "ls", bucketId], {
  encoding: "utf-8",
});
const data = JSON.parse(result);
```

**Python** — use `subprocess.run` with a list:

```python
import subprocess, json

# SAFE: arguments are a list, no shell=True
result = subprocess.run(
    ["prim", "store", "ls", bucket_id],
    capture_output=True, text=True, check=True,
)
data = json.loads(result.stdout)
```

### Dangerous patterns (never do this)

```typescript
// DANGEROUS: shell injection via string concatenation
const result = execSync(`prim store ls ${bucketId}`);

// DANGEROUS: user input directly in shell string
const result = execSync(`prim search web "${userQuery}"`);
```

An attacker-controlled `bucketId` like `; rm -rf /` would execute arbitrary commands.

### Passing data via stdin

Many CLI commands accept input from stdin, which avoids shell escaping issues entirely and handles large payloads:

```typescript
import { execFileSync } from "node:child_process";

// Pass JSON messages via stdin instead of --messages flag
const messages = JSON.stringify([{ role: "user", content: "Hello" }]);
const result = execFileSync("prim", ["infer", "chat", "--model", "gpt-4o"], {
  input: messages,
  encoding: "utf-8",
});
```

```python
import subprocess, json

# Pass text via stdin for embedding
result = subprocess.run(
    ["prim", "infer", "embed", "--model", "text-embedding-3-small"],
    input="Text to embed",
    capture_output=True, text=True, check=True,
)
```

### Commands with stdin support

| Command | Stdin field | Description |
|---------|-----------|-------------|
| `prim infer chat --model MODEL` | `messages` | JSON message array |
| `prim infer embed --model MODEL` | `input` | Text to embed |
| `prim mem upsert COLLECTION_ID` | `text` | Document text |
| `prim mem cache put NS KEY` | `value` | Cache value (JSON or string) |
| `prim store put BUCKET KEY` | raw bytes | Object data |
| `prim email send MAILBOX --to ADDR --subject SUBJ` | body text | Email body |

## MCP server

For Claude and other MCP-compatible agents, add the prim MCP server to your config:

```json
{
  "mcpServers": {
    "prim": {
      "command": "prim",
      "args": ["mcp"]
    }
  }
}
```

This exposes every primitive as an MCP tool. Claude can then call `store_put`, `infer_chat`, `mem_upsert`, etc. directly.

## Function-calling tools

For OpenAI-style function calling, tool definitions are available at `packages/tools/`. Each file is a JSON array of tool definitions compatible with the OpenAI tools format.

```typescript
import tools from "@primsh/tools/store.json";

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  tools,
  messages: [{ role: "user", content: "Upload my data" }],
});
```

## Security checklist

- [ ] Never use `execSync` or `shell=True` with string concatenation
- [ ] Always use `execFileSync` (Node) or `subprocess.run` with list args (Python)
- [ ] Prefer stdin for user-provided content (avoids escaping issues)
- [ ] Store private keys in environment variables, never in code
- [ ] Set `PRIM_MAX_PAYMENT` to limit per-request spend
- [ ] Use `--quiet` flag for machine-readable output (single values, no formatting)
