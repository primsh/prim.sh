// brand.ts — single source of truth for prim.sh brand copy
// Consumers: serve.ts, template.ts, README generation

export const BRAND = {
  name: "prim.sh",
  org: "Primitive Shell",
  copyright: "© 2026 Primitive Shell",
  tagline: "The agent-native stack.",
  sub: "Zero signup. One payment token. Infinite primitives.",
  closer: "Every service requires a human. This one doesn't.",
} as const;
