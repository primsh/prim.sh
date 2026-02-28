// brand.ts — single source of truth for prim.sh brand copy
// Consumers: serve.ts, template.ts, README generation

export const BRAND = {
  name: "prim.sh",
  org: "Primitive Shell",
  copyright: "© 2026 Primitive Shell",
  noun: "Agent infrastructure.",
  nounStyled: "The agent-native stack.",
  tagline: "Zero install. One curl. Infinite primitives.",
  sub: "Just add mcp.prim.sh, pay with USDC, use every service.",
  closer: "Every service requires a human. This one doesn't.",
  flywheel:
    "Use it. Build it. Ship it. Agents don't just consume primitives — they create them. One command scaffolds a new service. The CI pipeline ships it. The catalog grows because the users grow it.",
  description:
    "The agent-native stack. Zero install. One curl. Infinite primitives. Just add mcp.prim.sh, pay with USDC, use every service.",
} as const;
