/**
 * Provider registry — maps provider name to CloudProvider instance.
 */

import type { CloudProvider } from "./provider.ts";
import { createHetznerProvider } from "./hetzner.ts";

const registry = new Map<string, CloudProvider>();

function ensureDefaults(): void {
  if (registry.size > 0) return;
  const hetzner = createHetznerProvider();
  registry.set(hetzner.name, hetzner);
}

export function getProvider(name: string): CloudProvider {
  ensureDefaults();
  const provider = registry.get(name);
  if (!provider) {
    throw new Error(`Unknown provider: ${name}. Available: ${listProviders().join(", ")}`);
  }
  return provider;
}

export function listProviders(): string[] {
  ensureDefaults();
  return Array.from(registry.keys());
}

export function registerProvider(provider: CloudProvider): void {
  registry.set(provider.name, provider);
}

export function clearProviders(): void {
  registry.clear();
}
