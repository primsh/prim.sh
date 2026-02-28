/**
 * scripts/lib/render-readme.ts — Per-package README.md renderer
 *
 * Takes a Primitive (with routes_map, pricing, providers) and optional ParsedApi,
 * emits a complete README.md markdown string.
 */

import type { ParsedApi, ParsedField } from "./parse-api.js";
import type { Primitive, RouteMapping } from "./primitives.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fieldRow(f: ParsedField): string {
  const opt = f.optional ? "optional" : "required";
  const desc = f.description ? ` — ${f.description}` : "";
  return `| \`${f.name}\` | \`${f.type}\` | ${opt} |${desc}`;
}

function resolveFields(name: string, api: ParsedApi): ParsedField[] {
  const iface = api.interfaces.get(name);
  if (!iface) return [];
  const ownFields = iface.fields;
  if (iface.extends) {
    const parentFields = api.interfaces.get(iface.extends)?.fields ?? [];
    return [...parentFields, ...ownFields];
  }
  return ownFields;
}

function lookupPrice(
  route: string,
  prices: Map<string, string>,
  pricing?: Primitive["pricing"],
): string {
  // Try direct lookup
  // biome-ignore lint/style/noNonNullAssertion: guarded by .has() check
  if (prices.has(route)) return prices.get(route)!;

  // Normalize ":param" to "[param]" for lookup
  const bracketForm = route.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "[$1]");
  // biome-ignore lint/style/noNonNullAssertion: guarded by .has() check
  if (prices.has(bracketForm)) return prices.get(bracketForm)!;

  // Try prefix matching (same logic as render-llms-txt.ts)
  const method = route.split(" ")[0];
  const path = route.split(" ").slice(1).join(" ");
  const pathParts = path.split("/");

  for (const [key, val] of prices) {
    const km = key.split(" ")[0];
    if (km !== method) continue;
    const kp = key.split(" ").slice(1).join(" ");
    const kParts = kp.split("/");
    if (kParts.length !== pathParts.length) continue;
    let match = true;
    for (let i = 0; i < pathParts.length; i++) {
      const pp = pathParts[i];
      const kk = kParts[i];
      if (!pp.startsWith(":") && !kk.startsWith("[") && kk !== "*") {
        if (pp !== kk) {
          match = false;
          break;
        }
      }
    }
    if (match) return val;
  }

  return "$0.01";
}

// ── Section renderers ──────────────────────────────────────────────────────────

function renderTitle(p: Primitive): string {
  return `# ${p.name}\n\n> ${p.description}`;
}

function renderIntro(): string {
  return "Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.";
}

function renderRoutes(p: Primitive, api: ParsedApi | null, prices: Map<string, string>): string {
  const routes = p.routes_map ?? [];
  if (routes.length === 0) return "";

  const header =
    "| Route | Description | Price | Request | Response |\n|-------|-------------|-------|---------|----------|";
  const rows = routes.map((r) => {
    const price = lookupPrice(r.route, prices, p.pricing);
    const reqType = r.request_type ?? r.request ?? "—";
    const resType = r.response_type ?? r.response ?? "—";
    return `| \`${r.route}\` | ${r.description} | ${price} | \`${reqType}\` | \`${resType}\` |`;
  });

  return `## Routes\n\n${header}\n${rows.join("\n")}`;
}

function renderPricing(p: Primitive): string {
  if (!p.pricing || p.pricing.length === 0) return "";

  const header = "| Operation | Price | Notes |\n|-----------|-------|-------|";
  const rows = p.pricing.map((row) => `| ${row.op} | ${row.price} | ${row.note ?? ""} |`);

  return `## Pricing\n\n${header}\n${rows.join("\n")}`;
}

function renderTypes(p: Primitive, api: ParsedApi): string {
  const routes = p.routes_map ?? [];
  if (routes.length === 0) return "";

  const sections: string[] = [];

  for (const r of routes) {
    const reqName = r.request_type ?? r.request;
    const resName = r.response_type ?? r.response;

    // Request type
    if (reqName && reqName !== "null") {
      const fields = resolveFields(reqName, api);
      if (fields.length > 0) {
        const header = "| Field | Type | Required |\n|-------|------|----------|";
        const rows = fields.map((f) => {
          const opt = f.optional ? "optional" : "required";
          return `| \`${f.name}\` | \`${f.type}\` | ${opt} |`;
        });
        sections.push(`### \`${reqName}\`\n\n${header}\n${rows.join("\n")}`);
      }
    }

    // Response type
    if (resName && resName !== "null" && resName !== "EmptyResponse") {
      const fields = resolveFields(resName, api);
      if (fields.length > 0) {
        const header = "| Field | Type | Description |\n|-------|------|-------------|";
        const rows = fields.map((f) => {
          return `| \`${f.name}\` | \`${f.type}\` | ${f.description} |`;
        });
        sections.push(`### \`${resName}\`\n\n${header}\n${rows.join("\n")}`);
      }
    }
  }

  if (sections.length === 0) return "";

  // Deduplicate (same type can appear in multiple routes)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const s of sections) {
    const name = s.split("\n")[0];
    if (seen.has(name)) continue;
    seen.add(name);
    unique.push(s);
  }

  return `## Request / Response Types\n\n${unique.join("\n\n")}`;
}

function renderProviders(p: Primitive): string {
  if (!p.providers || p.providers.length === 0) return "";

  const header = "| Provider | Status | Default |\n|----------|--------|---------|\n";
  const rows = p.providers.map((prov) => {
    const link = prov.url ? `[${prov.name}](${prov.url})` : prov.name;
    return `| ${link} | ${prov.status} | ${prov.default ? "yes" : "no"} |`;
  });

  return `## Providers\n\n${header}${rows.join("\n")}`;
}

function renderUsage(p: Primitive): string {
  const endpoint = p.endpoint ?? `${p.id}.prim.sh`;
  const routes = p.routes_map ?? [];
  const firstPost = routes.find((r) => r.route.startsWith("POST "));
  const examplePath = firstPost ? firstPost.route.replace(/^[A-Z]+\s+/, "") : "/v1/...";

  return `## Usage

\`\`\`bash
# Install
curl -fsSL https://${endpoint}/install.sh | sh

# Example request
curl -X POST https://${endpoint}${examplePath} \\
  -H "X-402-Payment: $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{}'
\`\`\``;
}

function renderEnv(p: Primitive): string {
  const envList = (p.env ?? []).map((e) => `- \`${e}\``).join("\n");
  return `## Environment\n\n${envList || "_No environment variables required._"}`;
}

function renderDev(p: Primitive): string {
  return `## Development

\`\`\`bash
pnpm install
pnpm dev           # run locally (port ${p.port ?? "??"})
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
\`\`\``;
}

function renderX402Note(): string {
  return `## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.`;
}

function renderLicense(): string {
  return "## License\n\nApache-2.0";
}

// ── Main renderer ──────────────────────────────────────────────────────────────

/**
 * Render a complete README.md for a primitive package.
 *
 * @param p          Primitive metadata from prim.yaml + primitives.yaml
 * @param api        ParsedApi from api.ts (null if no api.ts exists)
 * @param prices     Route price map from parseRoutePrices()
 */
export function renderReadme(
  p: Primitive,
  api: ParsedApi | null,
  prices: Map<string, string>,
): string {
  const sections: string[] = [];

  sections.push(renderTitle(p));
  sections.push(renderIntro());
  sections.push(renderRoutes(p, api, prices));
  sections.push(renderPricing(p));

  if (api) {
    const types = renderTypes(p, api);
    if (types) sections.push(types);
  }

  const providers = renderProviders(p);
  if (providers) sections.push(providers);

  sections.push(renderUsage(p));
  sections.push(renderEnv(p));
  sections.push(renderDev(p));
  sections.push(renderX402Note());
  sections.push(renderLicense());

  return `${sections.filter(Boolean).join("\n\n")}\n`;
}
