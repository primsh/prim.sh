// SPDX-License-Identifier: Apache-2.0
/**
 * scripts/lib/provider-gen.ts — Generate vendor implementation files
 *
 * Extracts provider interface info from an existing provider.ts and generates
 * a vendor .ts file implementing that interface with singleton pattern.
 */

import { readFileSync } from "node:fs";

// ── Naming helpers ──────────────────────────────────────────────────────────

/** snake_case or kebab-case → camelCase */
function toCamelCase(s: string): string {
  return s.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
}

/** snake_case or kebab-case → PascalCase */
export function toPascalCase(s: string): string {
  const c = toCamelCase(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

// ── Provider interface parser ───────────────────────────────────────────────

export interface ProviderInterfaceInfo {
  interfaceName: string;
  dataTypeName: string | null;
}

/**
 * Parse provider.ts source text and extract the main provider interface name
 * and associated data type name.
 *
 * Looks for `export interface <Name>Provider` (excluding supporting types like
 * ProviderConfig, ProviderData, ProviderParams, ProviderResult).
 */
export function parseProviderInterfaceFromSource(src: string): ProviderInterfaceInfo | null {
  const interfaceRe = /export\s+interface\s+([A-Za-z_$][A-Za-z0-9_$]*Provider)\b/g;
  let match: RegExpExecArray | null;
  const candidates: string[] = [];

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((match = interfaceRe.exec(src)) !== null) {
    const name = match[1];
    // Skip supporting types — we want the main provider interface
    if (
      name.endsWith("ProviderConfig") ||
      name.endsWith("ProviderData") ||
      name.endsWith("ProviderParams") ||
      name.endsWith("ProviderResult") ||
      name.endsWith("ProviderLocation") ||
      name.endsWith("ProviderEvent")
    )
      continue;
    candidates.push(name);
  }

  if (candidates.length === 0) return null;

  // Use the first matching provider interface
  const interfaceName = candidates[0];

  // Try to find a data type: <Prefix>ProviderData
  const prefix = interfaceName.replace(/Provider$/, "");
  const dataRe = new RegExp(`export\\s+interface\\s+(${prefix}ProviderData)\\b`);
  const dataMatch = src.match(dataRe);
  const dataTypeName = dataMatch ? dataMatch[1] : null;

  return { interfaceName, dataTypeName };
}

/**
 * Read a provider.ts file and extract the provider interface info.
 */
export function parseProviderInterface(providerTsPath: string): ProviderInterfaceInfo | null {
  const src = readFileSync(providerTsPath, "utf8");
  return parseProviderInterfaceFromSource(src);
}

// ── Vendor file generator ───────────────────────────────────────────────────

/**
 * Generate the content of a vendor .ts file that implements the prim's
 * provider interface with a singleton pattern.
 */
export function genVendorTs(
  primId: string,
  providerInterfaceName: string,
  vendorName: string,
  envKey: string,
): string {
  const className = `${toPascalCase(vendorName)}Client`;

  // Build import list — always import the interface, optionally import data type
  const prefix = providerInterfaceName.replace(/Provider$/, "");
  const dataTypeName = `${prefix}ProviderData`;

  // We import ProviderError as a value and the interface + data type as types.
  // The data type may not exist, but the generated file will reference it as a
  // TODO placeholder anyway — the developer will adjust imports.
  return `import { ProviderError } from "./provider.ts"
import type { ${providerInterfaceName} } from "./provider.ts"

export class ${className} implements ${providerInterfaceName} {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  // TODO: Implement provider methods
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _client: ${className} | undefined
let _clientKey: string | undefined

export function resetClient(): void {
  _client = undefined
  _clientKey = undefined
}

export function getClient(): ${className} {
  const key = process.env.${envKey}
  if (!key) throw new ProviderError("${envKey} is not configured", "provider_error")
  if (!_client || _clientKey !== key) {
    _client = new ${className}(key)
    _clientKey = key
  }
  return _client
}
`;
}
