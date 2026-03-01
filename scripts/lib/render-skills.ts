// SPDX-License-Identifier: Apache-2.0
import type { Primitive } from "./primitives.js";

interface SkillOperation {
  id: string;
  route: string;
  description: string;
  price: string;
}

interface SkillProvider {
  name: string;
  status: string;
}

interface SkillPrimitive {
  id: string;
  name: string;
  endpoint: string;
  description: string;
  status: string;
  interfaces: {
    mcp: boolean;
    cli: boolean;
    tools: boolean;
    rest: boolean;
  };
  operations: SkillOperation[];
  providers: SkillProvider[];
}

interface SkillsRegistry {
  version: string;
  generated: string;
  primitives: SkillPrimitive[];
}

export function renderSkillsJson(prims: Primitive[]): string {
  const primitives: SkillPrimitive[] = prims
    .filter((p) => p.show_on_index !== false)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => {
      const isActive = p.status === "mainnet" || p.status === "testnet";

      const operations: SkillOperation[] =
        isActive && p.routes_map
          ? p.routes_map.map((r, i) => ({
              id: r.operation_id ?? r.route.split(" ").pop()?.replace(/\//g, "_") ?? r.route,
              route: r.route,
              description: r.description,
              price: p.pricing?.[i]?.price ?? "$0.00",
            }))
          : [];

      return {
        id: p.id,
        name: `${p.id}.sh`,
        endpoint: p.endpoint ?? `https://${p.id}.prim.sh`,
        description: p.description,
        status:
          p.status === "mainnet" || p.status === "testnet" ? "live" : "planned",
        interfaces: {
          mcp: p.interfaces?.mcp ?? true,
          cli: p.interfaces?.cli ?? true,
          tools: p.interfaces?.tools ?? true,
          rest: p.interfaces?.rest ?? true,
        },
        operations,
        providers: (p.providers ?? []).map((pr) => ({
          name: pr.name,
          status: pr.status,
        })),
      };
    });

  const registry: SkillsRegistry = {
    version: "1.0.0",
    generated: new Date().toISOString(),
    primitives,
  };

  return `${JSON.stringify(registry, null, 2)}\n`;
}
