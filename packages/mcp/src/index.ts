#!/usr/bin/env bun
import { startMcpServer, isPrimitive } from "./server.js";
import type { Primitive } from "./server.js";

const argv = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith(`--${name}=`)) return argv[i].slice(`--${name}=`.length);
    if (argv[i] === `--${name}`) {
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) return argv[i + 1];
      return "";
    }
  }
  return undefined;
}

function hasFlag(name: string): boolean {
  return argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
}

if (hasFlag("help") || hasFlag("h")) {
  process.stdout.write(
    [
      "Usage: prim mcp [--primitives wallet,store,...] [--wallet 0x...]",
      "",
      "Starts a prim MCP server on stdio.",
      "",
      "Options:",
      "  --primitives  Comma-separated list of primitives to expose.",
      "                Default: wallet,store,spawn,faucet,search",
      "  --wallet      Wallet address override (also: PRIM_WALLET env var).",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const primitivesFlag = getFlag("primitives");
const walletFlag = getFlag("wallet");

let primitives: Primitive[] | undefined;
if (primitivesFlag) {
  const parsed = primitivesFlag
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const invalid = parsed.filter((s) => !isPrimitive(s));
  if (invalid.length > 0) {
    process.stderr.write(
      `Error: Unknown primitives: ${invalid.join(", ")}. Valid: wallet, store, spawn, faucet, search\n`,
    );
    process.exit(1);
  }
  primitives = parsed as Primitive[];
}

startMcpServer({ primitives, walletAddress: walletFlag }).catch((err) => {
  process.stderr.write(
    `Fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
