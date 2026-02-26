// site/brand.ts — single source of truth for prim.sh brand copy
// Consumers: serve.ts (index.html substitution), template.ts (future)

export const BRAND = {
  name: "prim.sh",
  tagline: "The agent-native stack.",
  sub: "Zero signup. One payment token. Infinite primitives.",
  closer: "Every service requires a human. This one doesn't.",
} as const;
