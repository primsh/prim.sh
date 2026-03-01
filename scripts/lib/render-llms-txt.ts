// SPDX-License-Identifier: Apache-2.0
/**
 * scripts/lib/render-llms-txt.ts -- llms.txt renderer
 *
 * Takes a Primitive (with routes_map) and ParsedApi, emits a complete llms.txt string.
 * Also exports parseRoutePrices() for extracting ROUTES const from index.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import type { ParsedApi, ParsedField } from "./parse-api.js";
import type { Primitive, RouteMapping } from "./primitives.js";

// ── Route price extraction ────────────────────────────────────────────────────

/**
 * Extract the ROUTES const from a prim's index.ts.
 * Returns a map from normalized route key (e.g. "POST /v1/search") to price string (e.g. "$0.01").
 * Normalizes [id] and * path segments to :param style for matching against routes_map.
 */
export function parseRoutePrices(indexPath: string): Map<string, string> {
  const prices = new Map<string, string>();
  if (!existsSync(indexPath)) return prices;

  const src = readFileSync(indexPath, "utf8");

  // Find the ROUTES const: any name ending in _ROUTES or ROUTES
  const match = src.match(/const\s+\w+ROUTES\s*=\s*\{([\s\S]*?)\}\s*as\s+const/);
  if (!match) return prices;

  const inner = match[1];
  // Each line: "METHOD /path": "$price",
  const lineRe = /"([A-Z]+\s+\/[^"]+)"\s*:\s*"(\$[^"]+)"/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = lineRe.exec(inner)) !== null) {
    const rawRoute = m[1];
    const price = m[2];
    // Normalize: [id] -> :id, [address] -> :address, * -> :key (wildcard)
    const normalized = rawRoute.replace(/\[([^\]]+)\]/g, ":$1").replace(/\*/g, ":param");
    prices.set(normalized, price);
    // Also store the raw form for lookup fallback
    prices.set(rawRoute, price);
  }

  return prices;
}

// ── Alignment helpers ─────────────────────────────────────────────────────────

function pad(s: string, width: number): string {
  return s.length >= width ? `${s}  ` : s + " ".repeat(width - s.length + 2);
}

function columnAlign(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const widths: number[] = [];
  for (const row of rows) {
    for (let c = 0; c < row.length - 1; c++) {
      widths[c] = Math.max(widths[c] ?? 0, row[c].length);
    }
  }
  return rows.map(
    (row) =>
      `  ${row
        .map((cell, c) => (c < row.length - 1 ? pad(cell, widths[c]) : cell))
        .join("")
        .trimEnd()}`,
  );
}

// ── Path param extraction ─────────────────────────────────────────────────────

// Extract path params from a route string like "GET /v1/wallets/:address/policy"
function extractPathParams(route: string): string[] {
  const params: string[] = [];
  const re = /:([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(route)) !== null) {
    params.push(m[1]);
  }
  return params;
}

// ── Price lookup ──────────────────────────────────────────────────────────────

/**
 * Look up the price for a route in the prices map.
 * Tries several normalizations to find a match.
 */
function lookupPrice(route: string, prices: Map<string, string>): string | null {
  // Direct lookup
  // biome-ignore lint/style/noNonNullAssertion: guarded by .has() check
  if (prices.has(route)) return prices.get(route)!;

  // Normalize ":param" to "[param]" for lookup
  const bracketForm = route.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "[$1]");
  // biome-ignore lint/style/noNonNullAssertion: guarded by .has() check
  if (prices.has(bracketForm)) return prices.get(bracketForm)!;

  // Normalize ":key" wildcard params to "*"
  const wildcardForm = route.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    // Use * for final path params that look like wildcards
    return `[${name}]`;
  });
  // biome-ignore lint/style/noNonNullAssertion: guarded by .has() check
  if (prices.has(wildcardForm)) return prices.get(wildcardForm)!;

  // Try matching by prefix: the route in routes_map may use :key where ROUTES uses *
  // e.g. "PUT /v1/buckets/:id/objects/:key" vs "PUT /v1/buckets/[id]/objects/*"
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
      // Both are static — must match exactly
      if (!pp.startsWith(":") && !kk.startsWith("[") && kk !== "*") {
        if (pp !== kk) {
          match = false;
          break;
        }
      }
      // Either is a param/wildcard — matches anything
    }
    if (match) return val;
  }

  return null;
}

// ── Field renderer ────────────────────────────────────────────────────────────

/**
 * Render a list of ParsedField objects as column-aligned text rows.
 * reqLabel: "required" | "optional" — override for response fields (no req/opt)
 */
function renderFields(fields: ParsedField[], indent: string, showReqOpt: boolean): string {
  if (fields.length === 0) return "";
  const rows: string[][] = fields.map((f) => {
    if (showReqOpt) {
      return [f.name, f.type, f.optional ? "optional" : "required", f.description];
    }
    return [f.name, f.type, f.description];
  });
  return columnAlign(rows)
    .map((l) => indent + l.trimStart())
    .join("\n");
}

// ── Interface lookup with extends resolution ──────────────────────────────────

/**
 * Get all fields for an interface, including inherited fields from extends clause.
 * Only resolves one level of inheritance (sufficient for the codebase).
 */
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

// ── Section renderers ─────────────────────────────────────────────────────────

function renderHeader(p: Primitive): string {
  const endpoint = p.endpoint ?? `${p.id}.prim.sh`;
  const isFaucet = p.id === "faucet";

  const authLine = isFaucet
    ? "None (free, rate-limited by address). Wallet must be on allowlist during beta."
    : "x402 (USDC on Base Sepolia). GET /, GET /pricing, GET /v1/metrics are free.";
  const chainLine = "Base Sepolia (eip155:84532) during beta.";

  const lines = [
    `# ${endpoint}`,
    "",
    p.description,
    "",
    `Base URL: https://${endpoint}`,
    `Auth: ${authLine}`,
    `Chain: ${chainLine}`,
    "",
    "Install:",
    `  curl -fsSL https://${endpoint}/install.sh | sh`,
  ];

  return lines.join("\n");
}

function renderLimitsBlock(p: Primitive): string {
  if (!p.limits || p.limits.length === 0) return "";
  const lines = ["", "Limits:"];
  for (const l of p.limits) {
    lines.push(`  ${l}`);
  }
  return lines.join("\n");
}

function renderQuickStart(p: Primitive): string {
  if (!p.quick_start || p.quick_start.length === 0) return "";
  const lines = ["## Quick Start", ""];
  for (let i = 0; i < p.quick_start.length; i++) {
    lines.push(`  ${i + 1}. ${p.quick_start[i]}`);
  }
  return lines.join("\n");
}

function renderTips(p: Primitive): string {
  if (!p.tips || p.tips.length === 0) return "";
  const lines = ["## Tips", ""];
  for (const t of p.tips) {
    lines.push(`  - ${t}`);
  }
  return lines.join("\n");
}

function renderX402Section(p: Primitive, api: ParsedApi): string {
  const isFaucet = p.id === "faucet";
  if (isFaucet) return "";

  const errorCodesBlock =
    api.errorCodes.length > 0 ? api.errorCodes.map((c) => `  ${c}`).join("\n") : "  (none)";

  return [
    "## x402 Payment",
    "",
    "  1. Make request. Server returns 402 with Payment-Required header.",
    "  2. Sign EIP-3009 transferWithAuthorization.",
    "  3. Retry with Payment-Signature header (base64-encoded signed authorization).",
    "",
    "Error envelope:",
    '  {"error": {"code": "<code>", "message": "<msg>"}}',
    "",
    "Error codes:",
    errorCodesBlock,
  ].join("\n");
}

function renderFreeErrorSection(api: ParsedApi): string {
  const errorCodesBlock =
    api.errorCodes.length > 0 ? api.errorCodes.map((c) => `  ${c}`).join("\n") : "  (none)";

  return [
    "## Error envelope",
    "",
    '  {"error": {"code": "<code>", "message": "<msg>"}}',
    "",
    "Error codes:",
    errorCodesBlock,
  ].join("\n");
}

function renderFreeEndpoints(p: Primitive): string {
  const endpoint = p.endpoint ?? `${p.id}.prim.sh`;
  return [
    "### GET /",
    "",
    "Health check.",
    "",
    "Free.",
    "",
    "Response (200):",
    `  service  string  "${p.id}.sh"`,
    `  status   string  "ok"`,
    "",
    "---",
    "",
    "### GET /pricing",
    "",
    "Machine-readable pricing for all endpoints.",
    "",
    "Free.",
    "",
    "Response (200):",
    `  service   string  "${endpoint}"`,
    `  currency  string  "USDC"`,
    `  network   string  "eip155:8453"`,
    "  routes    array   Route pricing list",
    "    .method       string  HTTP method",
    "    .path         string  URL path",
    "    .price_usdc   string  Price in USDC (decimal string)",
    "    .description  string  Human-readable description",
    "",
    "---",
    "",
    "### GET /v1/metrics",
    "",
    "Operational metrics. Uptime, request counts, latency percentiles, error rates.",
    "",
    "Free.",
    "",
    "Response (200):",
    `  service     string  "${endpoint}"`,
    "  uptime_s    number  Seconds since last restart",
    "  requests    object  Request counts and latencies by endpoint",
    "  payments    object  Payment counts by endpoint",
    "  errors      object  Error counts by status code",
  ].join("\n");
}

function renderRoute(rm: RouteMapping, api: ParsedApi, prices: Map<string, string>): string {
  const [method, ...pathParts] = rm.route.split(" ");
  const path = pathParts.join(" ");
  const lines: string[] = [];

  lines.push(`### ${method} ${path}`);
  lines.push("");
  lines.push(rm.description);
  if (rm.notes) {
    lines.push("");
    lines.push(rm.notes);
  }
  lines.push("");

  // Price
  const price = lookupPrice(rm.route, prices);
  if (price) {
    lines.push(`Price: ${price}`);
    lines.push("");
  } else if (!rm.notes || !rm.notes.toLowerCase().includes("free")) {
    lines.push("Free.");
    lines.push("");
  }

  // Path params
  const pathParams = extractPathParams(rm.route);
  if (pathParams.length > 0) {
    lines.push("Path params:");
    const rows = pathParams.map((p) => [p, "string", "required", `${p} parameter`]);
    lines.push(columnAlign(rows).join("\n"));
    lines.push("");
  }

  // Query params
  if (rm.query_params && rm.query_params.length > 0) {
    lines.push("Query params:");
    const rows = rm.query_params.map((qp) => [qp.name, qp.type, "optional", qp.description]);
    lines.push(columnAlign(rows).join("\n"));
    lines.push("");
  }

  // Request body
  if (rm.request) {
    const reqFields = resolveFields(rm.request, api);
    if (reqFields.length > 0) {
      lines.push("Request:");
      lines.push(renderFields(reqFields, "  ", true));
      lines.push("");
    }
  }

  // Response
  const respStr = rm.response ?? "null";
  const respFields = resolveFields(rm.response, api);
  // Check if it's a raw string description (not a type name)
  const isRawResponse =
    respStr.includes(" ") ||
    respStr.startsWith("Raw") ||
    respStr === "EmptyResponse" ||
    (!api.interfaces.has(respStr) && respStr !== "null");

  if (respStr === "EmptyResponse" || respStr === "null" || respStr === "" || rm.response == null) {
    lines.push(`Response (${rm.status}): {} (empty object)`);
    lines.push("");
  } else if (isRawResponse && respFields.length === 0) {
    lines.push(`Response (${rm.status}): ${respStr}`);
    lines.push("");
  } else if (respFields.length > 0) {
    lines.push(`Response (${rm.status}):`);
    lines.push(renderFields(respFields, "  ", false));
    lines.push("");
  } else {
    // Unknown type — show what we know
    lines.push(`Response (${rm.status}): ${respStr}`);
    lines.push("");
  }

  // Errors
  if (rm.errors && rm.errors.length > 0) {
    lines.push("Errors:");
    const rows = rm.errors.map((e) => [String(e.status), e.code, e.description]);
    lines.push(columnAlign(rows).join("\n"));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function renderOwnership(p: Primitive): string {
  if (!p.ownership) return "";
  return ["## Ownership", "", p.ownership].join("\n");
}

// ── Main renderer ─────────────────────────────────────────────────────────────

/**
 * Render a complete llms.txt string for a primitive.
 *
 * @param p           Primitive with routes_map populated
 * @param api         ParsedApi from parseApiFile
 * @param prices      Route price map from parseRoutePrices
 */
export function renderLlmsTxt(p: Primitive, api: ParsedApi, prices: Map<string, string>): string {
  const isFaucet = p.id === "faucet";
  const sections: string[] = [];

  // 1. Header
  sections.push(renderHeader(p));

  // 2. Limits block (inline after header if present)
  const limitsBlock = renderLimitsBlock(p);
  if (limitsBlock) sections.push(limitsBlock);

  sections.push("\n---");

  // 3. Quick Start + Tips (if present)
  const qs = renderQuickStart(p);
  const tips = renderTips(p);
  if (qs || tips) {
    const qsTips: string[] = [];
    if (qs) qsTips.push(qs);
    if (tips) qsTips.push(tips);
    sections.push(qsTips.join("\n\n"));
    sections.push("\n---");
  }

  // 4. x402 Payment section (or faucet error envelope)
  if (isFaucet) {
    sections.push(renderFreeErrorSection(api));
  } else {
    sections.push(renderX402Section(p, api));
  }

  sections.push("\n---");

  // 5. Endpoints
  const endpointLines: string[] = ["## Endpoints", ""];

  // Standard free endpoints
  endpointLines.push(renderFreeEndpoints(p));
  endpointLines.push("\n---");

  // Per-route docs
  if (p.routes_map) {
    for (const rm of p.routes_map) {
      endpointLines.push(renderRoute(rm, api, prices));
      endpointLines.push("\n---");
    }
  }

  sections.push(endpointLines.join("\n\n"));

  // 6. Ownership
  const ownership = renderOwnership(p);
  if (ownership) {
    sections.push(ownership);
  }

  // Join sections with double-newline separator, then normalize trailing newlines
  return `${sections
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}
