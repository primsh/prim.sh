#!/usr/bin/env bun
/**
 * create-provider.ts — Provider vendor scaffolder
 *
 * Generates a vendor implementation file for a prim's provider interface.
 *
 * Usage:
 *   pnpm create-provider <prim> <vendor>
 *   pnpm create-provider <prim> <vendor> --force
 *
 * Example:
 *   pnpm create-provider search serper
 *   → packages/search/src/serper.ts (SerperClient implements SearchProvider)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { parse as parseYaml } from "yaml"
import { parseProviderInterface, genVendorTs, toPascalCase } from "./lib/provider-gen.ts"

const ROOT = join(import.meta.dir, "..")

function fatal(msg: string): never {
  console.error(`error: ${msg}`)
  process.exit(1)
}

// ── Parse CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")))
const force = flags.has("--force")

const primId = args[0]
const vendorName = args[1]

if (!primId || !vendorName) {
  console.error("usage: pnpm create-provider <prim> <vendor> [--force]")
  process.exit(1)
}

// ── Validate prim exists ────────────────────────────────────────────────────

const pkgDir = join(ROOT, "packages", primId)
if (!existsSync(pkgDir)) {
  fatal(`packages/${primId}/ does not exist`)
}

// ── Read prim.yaml ──────────────────────────────────────────────────────────

const yamlPath = join(pkgDir, "prim.yaml")
if (!existsSync(yamlPath)) {
  fatal(`packages/${primId}/prim.yaml not found`)
}

const primYaml = parseYaml(readFileSync(yamlPath, "utf8")) as {
  id: string
  providers?: Array<{ name: string; env?: string[]; env_key?: string }>
}

// ── Check provider.ts exists ────────────────────────────────────────────────

const providerTsPath = join(pkgDir, "src", "provider.ts")
if (!existsSync(providerTsPath)) {
  fatal(`packages/${primId}/src/provider.ts not found — this prim has no provider interface`)
}

// ── Parse provider interface ────────────────────────────────────────────────

const info = parseProviderInterface(providerTsPath)
if (!info) {
  fatal(`could not find a provider interface in packages/${primId}/src/provider.ts`)
}

// ── Determine env key ───────────────────────────────────────────────────────

let envKey = `${vendorName.toUpperCase()}_API_KEY`

// Check prim.yaml providers array for a matching vendor with explicit env
const providers = primYaml.providers ?? []
const matchingProvider = providers.find(
  (p) => p.name.toLowerCase() === vendorName.toLowerCase(),
)
if (matchingProvider?.env_key) {
  envKey = matchingProvider.env_key
} else if (matchingProvider?.env) {
  // Use first env key that looks like an API key
  const apiKeyEnv = matchingProvider.env.find((e) => e.includes("API_KEY"))
  if (apiKeyEnv) envKey = apiKeyEnv
}

// ── Generate vendor file ────────────────────────────────────────────────────

const content = genVendorTs(primId, info.interfaceName, vendorName, envKey)

const outPath = join(pkgDir, "src", `${vendorName.toLowerCase()}.ts`)
if (existsSync(outPath) && !force) {
  fatal(`${outPath} already exists (use --force to overwrite)`)
}

writeFileSync(outPath, content, "utf8")

const className = toPascalCase(vendorName) + "Client"
console.log(`created ${outPath}`)
console.log(`  ${className} implements ${info.interfaceName}`)
console.log(`  env: ${envKey}`)
