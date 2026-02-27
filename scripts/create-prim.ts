#!/usr/bin/env bun
/**
 * create-prim.ts — Prim package scaffolder
 *
 * Reads packages/<id>/prim.yaml and generates all boilerplate files for a
 * new prim package. Existing files are skipped unless --force is passed.
 *
 * Usage:
 *   pnpm create-prim <id>
 *   pnpm create-prim <id> --force
 *   pnpm create-prim --interactive
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// ── Types ──────────────────────────────────────────────────────────────────

interface RouteError {
  status: number;
  code: string;
  description: string;
}

interface RouteMapping {
  route: string;
  request: string | null;
  response: string;
  status: number;
  description: string;
  notes?: string;
  errors?: RouteError[];
}

interface PricingRow {
  op: string;
  price: string;
  note?: string;
}

interface ProviderConfig {
  name: string;
  env_key?: string;
  description?: string;
}

interface PrimYaml {
  id: string;
  name: string;
  endpoint?: string;
  description: string;
  port: number;
  type?: string;
  status?: string;
  accent?: string;
  accent_dim?: string;
  accent_glow?: string;
  env?: string[];
  pricing?: PricingRow[];
  routes_map?: RouteMapping[];
  providers?: ProviderConfig[];
  wraps?: string;
}

// ── Naming helpers ──────────────────────────────────────────────────────────

/** snake_case or kebab-case → camelCase  (e.g. "search_web" → "searchWeb") */
function toCamelCase(s: string): string {
  return s.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
}

/** snake_case or kebab-case → PascalCase  (e.g. "search_web" → "SearchWeb") */
function toPascalCase(s: string): string {
  const c = toCamelCase(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/**
 * Derive a stable operation_id from a route string.
 * "POST /v1/search/news" → "search_news"
 * "POST /v1/track"       → "track"
 */
function routeToOperationId(route: string): string {
  // strip method + leading /v1/
  const path = route.replace(/^[A-Z]+\s+\/v1\//, "").replace(/^\//, "");
  // replace slashes and hyphens with underscores
  return path.replace(/[-/]/g, "_").replace(/[^a-z0-9_]/gi, "").toLowerCase();
}

/** Route string → price string from routes_map entry (extract dollar amount) */
function routeToPrice(route: RouteMapping): string {
  // Try to extract from pricing.price if available directly; fall back to "$0.01"
  return "$0.01";
}

/** Uppercase const name for routes object, e.g. "search" → "SEARCH_ROUTES" */
function routesConstName(id: string): string {
  return `${id.toUpperCase().replace(/-/g, "_")}_ROUTES`;
}

// ── Extract pricing from prim.yaml ──────────────────────────────────────────

/**
 * Build a route→price map from prim.yaml data.
 * Matches pricing rows to routes by position or by op name matching.
 * Falls back to "$0.01" for any unmatched route.
 */
function buildRoutePriceMap(
  routes: RouteMapping[],
  pricing: PricingRow[] | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};

  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    const key = r.route.split(" ")[1] ? r.route : r.route;
    // Try positional match from pricing array (skip "free" entries)
    const paidPricing = (pricing ?? []).filter((p) => p.price !== "free");
    const row = paidPricing[i];
    const price = row ? row.price.replace(/\$/g, "$") : "$0.01";
    // Normalize price to dollar format
    map[r.route] = price.startsWith("$") ? price : `$${price}`;
  }

  return map;
}

// ── File skip logic ─────────────────────────────────────────────────────────

let skipped = 0;
let written = 0;

function writeFile(filePath: string, content: string, force: boolean): void {
  if (existsSync(filePath) && !force) {
    console.log(`  skipped: ${filePath} (exists)`);
    skipped++;
    return;
  }
  // Ensure parent dir exists
  const dir = filePath.split("/").slice(0, -1).join("/");
  if (dir) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  console.log(`  wrote:   ${filePath}`);
  written++;
}

// ── Templates ───────────────────────────────────────────────────────────────

function genPackageJson(prim: PrimYaml): string {
  const keywords = ["prim", "x402", prim.id];
  if (prim.wraps) {
    keywords.push(prim.wraps.toLowerCase().replace(/\s+/g, "-"));
  }
  return JSON.stringify(
    {
      name: `@primsh/${prim.id}`,
      version: "0.0.0",
      private: false,
      type: "module",
      main: "src/index.ts",
      description: prim.description,
      repository: {
        type: "git",
        url: "https://github.com/primsh/prim",
        directory: `packages/${prim.id}`,
      },
      license: "Apache-2.0",
      author: "Prim (https://prim.sh)",
      keywords,
      scripts: {
        dev: "bun run src/index.ts",
        start: "bun run src/index.ts",
        lint: "biome lint .",
        format: "biome format .",
        typecheck: "tsc -p tsconfig.json --noEmit",
        test: "vitest --run --exclude test/smoke-live.test.ts",
        "test:smoke": "vitest --run --passWithNoTests test/smoke-live.test.ts",
        check: "pnpm lint && pnpm typecheck && pnpm test",
      },
      dependencies: {
        "@primsh/x402-middleware": "workspace:*",
        hono: "^4.4.7",
      },
      devDependencies: {
        "@x402/core": "^2.4.0",
        typescript: "^5.6.3",
        vitest: "^1.6.1",
      },
    },
    null,
    2,
  );
}

function genTsconfig(): string {
  return JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      compilerOptions: {
        outDir: "dist",
        rootDir: ".",
        allowImportingTsExtensions: true,
      },
      include: ["src", "test"],
    },
    null,
    2,
  );
}

function genVitestConfig(): string {
  return `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      reportsDirectory: "./coverage",
      provider: "v8",
      reporter: ["text", "json", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
`;
}

function genInstallSh(prim: PrimYaml): string {
  const endpoint = prim.endpoint ?? `${prim.id}.prim.sh`;
  return `#!/bin/sh
# Install ${prim.name} — prim.sh
# Usage: curl -fsSL https://${endpoint}/install.sh | sh
set -eu

LIB_DIR="$HOME/.prim/lib"
BIN_DIR="$HOME/.prim/bin"
BIN="$BIN_DIR/prim"
CLI="$LIB_DIR/cli.js"
BASE_URL="https://dl.prim.sh/latest"

# Ensure Bun is installed
if ! command -v bun >/dev/null 2>&1; then
  echo "Bun not found. Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

echo "Installing prim..."

mkdir -p "$LIB_DIR" "$BIN_DIR"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Download bundle + checksum
curl -fsSL -o "$TMPDIR/cli.js" "$BASE_URL/cli.js"
curl -fsSL -o "$TMPDIR/cli.js.sha256" "$BASE_URL/cli.js.sha256"

# Verify checksum
cd "$TMPDIR"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c cli.js.sha256 >/dev/null
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 -c cli.js.sha256 >/dev/null
fi
cd - >/dev/null

# Install bundle
cp "$TMPDIR/cli.js" "$CLI"

# Write wrapper
cat > "$BIN" <<'EOF'
#!/bin/sh
exec bun run "$HOME/.prim/lib/cli.js" "$@"
EOF
chmod +x "$BIN"

# Install ${prim.name} skills
"$BIN" install ${prim.id}

# Add to PATH
PATH_LINE="export PATH=\\"\\$HOME/.prim/bin:\\$PATH\\""
add_to_rc() {
  rc_file="$1"
  if [ -f "$rc_file" ]; then
    if ! grep -qF '.prim/bin' "$rc_file"; then
      printf '\\n# prim CLI\\n%s\\n' "$PATH_LINE" >> "$rc_file"
    fi
  fi
}
add_to_rc "$HOME/.bashrc"
add_to_rc "$HOME/.zshrc"

VERSION=$("$BIN" --version 2>/dev/null || echo "unknown")
echo ""
echo "prim v\${VERSION} installed to $BIN"
echo ""
echo "Restart your shell or run:"
echo "  export PATH=\\"\\$HOME/.prim/bin:\\$PATH\\""
echo ""
echo "  ${prim.name} installed. Your agent can now use ${prim.id} tools."
`;
}

function genIndexTs(prim: PrimYaml, routePrices: Record<string, string>): string {
  const routes = prim.routes_map ?? [];
  const constName = routesConstName(prim.id);
  const endpoint = prim.endpoint ?? `${prim.id}.prim.sh`;

  // Build imports for service functions
  const serviceFns = routes.map((r) => toCamelCase(routeToOperationId(r.route)));
  const requestTypes = routes
    .filter((r) => r.request)
    .map((r) => r.request as string);
  const uniqueRequestTypes = [...new Set(requestTypes)];

  // Build routes const entries
  const routeEntries = routes
    .map((r) => `  "${r.route}": "${routePrices[r.route] ?? "$0.01"}"`)
    .join(",\n");

  // Build handler blocks
  const handlers = routes.map((r) => {
    const opId = routeToOperationId(r.route);
    const fnName = toCamelCase(opId);
    const reqType = r.request ?? "Record<string, unknown>";
    const routePath = r.route.replace(/^[A-Z]+\s+/, "");
    const method = r.route.split(" ")[0].toLowerCase();

    return `// ${r.route} — ${r.description}
app.${method}("${routePath}", async (c) => {
  let body: ${reqType};
  try {
    body = await c.req.json<${reqType}>();
  } catch (err) {
    logger.warn("JSON parse failed on ${r.route}", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await ${fnName}(body);

  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "rate_limited") {
      return new Response(JSON.stringify(rateLimited(result.message)), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfter ?? "60"),
        },
      });
    }
    return c.json(providerError(result.message), 502);
  }

  return c.json(result.data, 200);
});`;
  });

  return `import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LLMS_TXT = import.meta.dir
  ? readFileSync(resolve(import.meta.dir, "../../../site/${prim.id}/llms.txt"), "utf-8")
  : "";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  createLogger,
  getNetworkConfig,
  metricsMiddleware,
  metricsHandler,
  requestIdMiddleware,
  invalidRequest,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
${uniqueRequestTypes.length > 0 ? `import type { ${uniqueRequestTypes.join(", ")} } from "./api.ts";` : ""}
import { ${serviceFns.join(", ")} } from "./service.ts";

const logger = createLogger("${prim.name}");

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
if (!PAY_TO_ADDRESS) {
  throw new Error("[${prim.name}] PRIM_PAY_TO environment variable is required");
}
const NETWORK = networkConfig.network;
const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

const ${constName} = {
${routeEntries}
} as const;

function providerError(message: string): ApiError {
  return { error: { code: "provider_error", message } };
}

function rateLimited(message: string): ApiError {
  return { error: { code: "rate_limited", message } };
}

type AppVariables = { walletAddress: string | undefined };
const app = new Hono<{ Variables: AppVariables }>();

app.use("*", requestIdMiddleware());

app.use("*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: "Request too large" }, 413),
}));

app.use("*", metricsMiddleware());

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: ["GET /", "GET /pricing", "GET /llms.txt", "GET /v1/metrics"],
      checkAllowlist,
    },
    { ...${constName} },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "${prim.name}", status: "ok" });
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

// GET /v1/metrics — operational metrics (free)
app.get("/v1/metrics", metricsHandler("${endpoint}"));

// GET /pricing — machine-readable pricing (free)
app.get("/pricing", (c) => {
  return c.json({
    service: "${endpoint}",
    currency: "USDC",
    network: "eip155:8453",
    routes: [
${routes
  .map(
    (r) =>
      `      { method: "${r.route.split(" ")[0]}", path: "${r.route.split(" ")[1]}", price_usdc: "${(routePrices[r.route] ?? "$0.01").replace("$", "")}", description: "${r.description}" }`,
  )
  .join(",\n")}
    ],
  });
});

${handlers.join("\n\n")}

export default app;
`;
}

function genApiTs(prim: PrimYaml): string {
  const routes = prim.routes_map ?? [];

  // Collect unique type names (request + response)
  // Use `type` alias (not interface) for empty skeletons to satisfy biome noEmptyInterface.
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const r of routes) {
    if (r.request && !seen.has(r.request)) {
      seen.add(r.request);
      blocks.push(`// TODO: Define request fields for ${r.route}
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface ${r.request} {
  // Add fields here
}`);
    }
    if (r.response && !seen.has(r.response)) {
      seen.add(r.response);
      blocks.push(`// TODO: Define response fields for ${r.route}
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface ${r.response} {
  // Add fields here
}`);
    }
  }

  return `// ─── ${prim.name} API types ─────────────────────────────────────────────────

${blocks.join("\n\n")}

// ─── Error ────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
    message: string;
  };
}

export const ERROR_CODES = [
  "invalid_request",
  "not_found",
  "rate_limited",
  "provider_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
`;
}

function genServiceTs(prim: PrimYaml): string {
  const routes = prim.routes_map ?? [];
  const hasProviders = (prim.providers ?? []).length > 0;

  const serviceResultType = `type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };`;

  const providerImport = hasProviders
    ? `import { ProviderError } from "./provider.ts";
import type { ${toPascalCase(prim.id)}Provider } from "./provider.ts";
// Re-export for convenience
export { ProviderError } from "./provider.ts";`
    : "";

  const requestTypes = [...new Set(routes.filter((r) => r.request).map((r) => r.request as string))];
  const responseTypes = [...new Set(routes.map((r) => r.response))];
  const typeImports = [...requestTypes, ...responseTypes];

  const fns = routes.map((r) => {
    const opId = routeToOperationId(r.route);
    const fnName = toCamelCase(opId);
    const reqType = r.request ?? "Record<string, unknown>";
    const resType = r.response;

    return `export async function ${fnName}(
  body: ${reqType},
): Promise<ServiceResult<${resType}>> {
  // TODO: Implement ${r.description}
  return { ok: false, status: 501, code: "not_implemented", message: "Not implemented" };
}`;
  });

  return `${providerImport ? providerImport + "\n" : ""}import type { ${typeImports.join(", ")} } from "./api.ts";

// ─── ServiceResult ────────────────────────────────────────────────────────────

${serviceResultType}

// ─── Service functions ────────────────────────────────────────────────────────

${fns.join("\n\n")}
`;
}

function genProviderTs(prim: PrimYaml): string | null {
  const providers = prim.providers ?? [];
  if (providers.length === 0) return null;

  const providerName = toPascalCase(prim.id) + "Provider";
  const providerDataName = toPascalCase(prim.id) + "ProviderData";

  const routes = prim.routes_map ?? [];

  return `// ─── Provider result types ────────────────────────────────────────────────────

// TODO: Define the data shape returned by the provider
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface ${providerDataName} {
  // Add provider data fields here
}

// ─── Provider interface ───────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add methods before implementing
export interface ${providerName} {
  // TODO: Add provider method signatures matching your routes
${routes.map((r) => `  // ${routeToOperationId(r.route)}(...): Promise<${providerDataName}>;`).join("\n")}
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class ProviderError extends Error {
  code: "not_found" | "invalid_request" | "provider_error" | "rate_limited";
  retryAfter?: number;

  constructor(
    message: string,
    code: "not_found" | "invalid_request" | "provider_error" | "rate_limited" = "provider_error",
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
`;
}

function genVendorTs(prim: PrimYaml): { filename: string; content: string } | null {
  const providers = prim.providers ?? [];
  if (providers.length === 0) return null;

  const vendor = providers[0];
  const vendorName = vendor.name.toLowerCase().replace(/\s+/g, "");
  const className = toPascalCase(vendorName) + "Client";
  const providerName = toPascalCase(prim.id) + "Provider";
  const providerDataName = toPascalCase(prim.id) + "ProviderData";

  const envKey = vendor.env_key ?? `${prim.id.toUpperCase()}_API_KEY`;

  return {
    filename: `${vendorName}.ts`,
    content: `import { ProviderError } from "./provider.ts";
import type { ${providerName}, ${providerDataName} } from "./provider.ts";

export class ${className} implements ${providerName} {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // TODO: Implement provider methods
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _client: ${className} | undefined;
let _clientKey: string | undefined;

export function resetClient(): void {
  _client = undefined;
  _clientKey = undefined;
}

export function getClient(): ${className} {
  const key = process.env.${envKey};
  if (!key) throw new ProviderError("${envKey} is not configured", "provider_error");
  if (!_client || _clientKey !== key) {
    _client = new ${className}(key);
    _clientKey = key;
  }
  return _client;
}
`,
  };
}

function genSmokeTestTs(prim: PrimYaml, routePrices: Record<string, string>): string {
  const routes = prim.routes_map ?? [];
  const constName = routesConstName(prim.id);

  // Use first route for check 4 + check 5
  const firstRoute = routes[0];
  if (!firstRoute) {
    // Degenerate case — no routes yet
    return `import { describe, expect, it, vi } from "vitest";

process.env.PRIM_NETWORK = "eip155:8453";
process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";

vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  return {
    ...original,
    createAgentStackMiddleware: vi.fn(
      () => async (_c: import("hono").Context, next: import("hono").Next) => { await next(); },
    ),
    createWalletAllowlistChecker: vi.fn(() => () => Promise.resolve(true)),
  };
});

import app from "../src/index.ts";
import { createAgentStackMiddleware } from "@primsh/x402-middleware";

describe("${prim.name} app", () => {
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  it("GET / returns { service: '${prim.name}', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "${prim.name}", status: "ok" });
  });

  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(vi.mocked(createAgentStackMiddleware)).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.any(Object),
    );
  });
});
`;
  }

  const firstOpId = routeToOperationId(firstRoute.route);
  const firstFnName = toCamelCase(firstOpId);
  const firstResType = firstRoute.response;
  const firstRoutePath = firstRoute.route.replace(/^[A-Z]+\s+/, "");
  const firstMethod = firstRoute.route.split(" ")[0];

  // Service mock entries — all service functions
  const serviceFns = routes.map((r) => toCamelCase(routeToOperationId(r.route)));

  // Routes object expectation for check 3
  const routesObjEntries = routes
    .map((r) => `        "${r.route}": expect.any(String)`)
    .join(",\n");

  return `import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";

process.env.PRIM_NETWORK = "eip155:8453";
process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";

// Bypass x402 so the handler is reachable in unit tests.
// Middleware wiring is verified via check 3 (spy on createAgentStackMiddleware).
vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  return {
    ...original,
    createAgentStackMiddleware: vi.fn(
      () => async (_c: Context, next: Next) => { await next(); },
    ),
    createWalletAllowlistChecker: vi.fn(() => () => Promise.resolve(true)),
  };
});

// Mock the service so smoke tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
${serviceFns.map((fn) => `    ${fn}: vi.fn()`).join(",\n")}
  };
});

import app from "../src/index.ts";
import { ${firstFnName} } from "../src/service.ts";
import { createAgentStackMiddleware } from "@primsh/x402-middleware";
import type { ${firstResType} } from "../src/api.ts";

// TODO: Fill in a realistic mock response for ${firstResType}
const MOCK_RESPONSE: ${firstResType} = {} as ${firstResType};

describe("${prim.name} app", () => {
  beforeEach(() => {
    vi.mocked(${firstFnName}).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: '${prim.name}', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "${prim.name}", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(vi.mocked(createAgentStackMiddleware)).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({
${routesObjEntries}
      }),
    );
  });

  // Check 4: happy path — handler returns 200 with mocked service response
  it("${firstMethod} ${firstRoutePath} with valid input returns 200", async () => {
    vi.mocked(${firstFnName}).mockResolvedValueOnce({ ok: true, data: MOCK_RESPONSE });

    const res = await app.request("${firstRoutePath}", {
      method: "${firstMethod}",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });

  // Check 5: 400 on invalid input — service returns invalid_request → handler maps to 400
  it("${firstMethod} ${firstRoutePath} with invalid input returns 400", async () => {
    vi.mocked(${firstFnName}).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid request",
    });

    const res = await app.request("${firstRoutePath}", {
      method: "${firstMethod}",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
`;
}

function genReadme(prim: PrimYaml, routePrices: Record<string, string>): string {
  const routes = prim.routes_map ?? [];
  const endpoint = prim.endpoint ?? `${prim.id}.prim.sh`;

  const routeTable = routes
    .map(
      (r) =>
        `| \`${r.route}\` | ${r.description} | ${routePrices[r.route] ?? "$0.01"} |`,
    )
    .join("\n");

  const pricingTable = (prim.pricing ?? [])
    .map((p) => `| ${p.op} | ${p.price} | ${p.note ?? ""} |`)
    .join("\n");

  const envList = (prim.env ?? []).map((e) => `- \`${e}\``).join("\n");

  return `# ${prim.name}

> ${prim.description}

Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.

## Routes

| Route | Description | Price |
|-------|-------------|-------|
${routeTable}

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
${pricingTable}

## Usage

\`\`\`bash
# Install
curl -fsSL https://${endpoint}/install.sh | sh

# Example request
curl -X POST https://${endpoint}${routes[0]?.route.replace(/^[A-Z]+\s+/, "") ?? "/v1/..."} \\
  -H "X-402-Payment: $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{}'
\`\`\`

## Environment

${envList || "_No environment variables required._"}

## Development

\`\`\`bash
pnpm install
pnpm dev           # run locally (port ${prim.port})
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
\`\`\`

## License

Apache-2.0
`;
}

// ── Interactive wizard ───────────────────────────────────────────────────────

const KNOWN_TYPES = [
  "crypto", "storage", "compute", "search", "email", "testnet",
  "defi", "memory", "domains", "logistics", "communication", "intelligence",
  "operations", "physical", "social",
];

const KNOWN_ACCENTS: Record<string, string> = {
  "#8BC34A": "lime-green (wallet)",
  "#FFB74D": "amber (store)",
  "#29B6F6": "sky-blue (faucet)",
  "#00ff88": "neon-green (spawn)",
  "#C6FF00": "acid-yellow (search)",
  "#6C8EFF": "indigo (email)",
  "#FFC107": "gold (token)",
  "#4DD0E1": "cyan (mem)",
  "#00ACC1": "teal (domain)",
  "#FF3D00": "deep-orange (track)",
};

/** Scan packages/ for existing prim.yaml files and return { id → port, accent } maps */
function scanExistingPrims(root: string): { ports: number[]; ids: string[]; usedAccents: string[] } {
  const packagesDir = join(root, "packages");
  const ports: number[] = [];
  const ids: string[] = [];
  const usedAccents: string[] = [];

  if (!existsSync(packagesDir)) return { ports, ids, usedAccents };

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const yamlPath = join(packagesDir, entry.name, "prim.yaml");
    if (!existsSync(yamlPath)) continue;
    try {
      const data = parseYaml(readFileSync(yamlPath, "utf-8")) as PrimYaml;
      if (data.id) ids.push(data.id);
      if (data.port) ports.push(data.port);
      if (data.accent) usedAccents.push(data.accent.toLowerCase());
    } catch {
      // ignore parse errors
    }
  }

  return { ports, ids, usedAccents };
}

/** Derive next available port starting from 3011 */
function nextPort(usedPorts: number[]): number {
  const portSet = new Set(usedPorts);
  let candidate = 3011;
  while (portSet.has(candidate)) candidate++;
  return candidate;
}

/** Suggest accent colors not already in use */
function unusedAccents(used: string[]): string[] {
  const usedSet = new Set(used.map((a) => a.toLowerCase()));
  return Object.keys(KNOWN_ACCENTS).filter((c) => !usedSet.has(c.toLowerCase()));
}

/** path → operation_id, e.g. "/v1/call" → "call", "/v1/messages/list" → "messages_list" */
function pathToOperationId(path: string): string {
  return path
    .replace(/^\/v1\//, "")
    .replace(/^\//, "")
    .replace(/[-/]/g, "_")
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase();
}

/** Convert operation_id to PascalCase TypeName, e.g. "search_web" → "SearchWebRequest" */
function opIdToTypeName(opId: string, suffix: string): string {
  return (
    opId
      .split("_")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("") + suffix
  );
}

/** dim an accent hex color by 20% */
function dimAccent(hex: string): string {
  const c = hex.replace("#", "");
  const r = Math.round(parseInt(c.slice(0, 2), 16) * 0.8);
  const g = Math.round(parseInt(c.slice(2, 4), 16) * 0.8);
  const b = Math.round(parseInt(c.slice(4, 6), 16) * 0.8);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** hex → rgba glow string */
function accentGlow(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.08)`;
}

/** Prompt helper: show question, return trimmed answer. Optional default shown in brackets. */
async function ask(rl: readline.Interface, question: string, defaultVal?: string): Promise<string> {
  const hint = defaultVal ? ` [${defaultVal}]` : "";
  const raw = await rl.question(`  ${question}${hint}: `);
  const answer = raw.trim();
  return answer !== "" ? answer : (defaultVal ?? "");
}

/** Prompt for y/n. Returns true for y/Y/yes, false for n/N/no. Default shown in brackets. */
async function confirm(rl: readline.Interface, question: string, defaultVal = true): Promise<boolean> {
  const hint = defaultVal ? "[Y/n]" : "[y/N]";
  const raw = await rl.question(`  ${question} ${hint}: `);
  const answer = raw.trim().toLowerCase();
  if (answer === "") return defaultVal;
  return answer === "y" || answer === "yes";
}

/** Run the interactive wizard. Returns a PrimYaml ready to write. */
async function runWizard(root: string): Promise<{ prim: PrimYaml; yamlStr: string } | null> {
  const { ports: usedPorts, ids: existingIds, usedAccents } = scanExistingPrims(root);

  const rl = readline.createInterface({ input, output });

  console.log("\n  prim.sh interactive creator\n");
  console.log("  Creates packages/<id>/prim.yaml and optionally scaffolds the package.\n");

  // Step 1: ID
  let id = "";
  while (true) {
    id = await ask(rl, "1. ID (lowercase letters only, e.g. ring)");
    if (!id) { console.log("  ID is required."); continue; }
    if (!/^[a-z][a-z0-9-]*$/.test(id)) { console.log("  ID must be lowercase letters/digits/hyphens, starting with a letter."); continue; }
    if (existingIds.includes(id)) { console.log(`  '${id}' already exists in packages/. Choose a different ID.`); continue; }
    break;
  }

  // Step 2: Name
  const nameSuggestion = `${id}.sh`;
  const name = await ask(rl, `2. Name`, nameSuggestion);

  // Step 3: Description
  let description = "";
  while (!description) {
    description = await ask(rl, "3. Description (~120 chars, what does it do?)");
    if (!description) console.log("  Description is required.");
  }

  // Step 4: Type
  console.log(`  Known types: ${KNOWN_TYPES.join(", ")}`);
  const type = await ask(rl, "4. Type (select from list above or enter custom)", KNOWN_TYPES[0]);

  // Step 5: Port
  const suggestedPort = nextPort(usedPorts);
  let port = suggestedPort;
  while (true) {
    const portStr = await ask(rl, `5. Port`, String(suggestedPort));
    const parsed = parseInt(portStr, 10);
    if (isNaN(parsed) || parsed < 1024 || parsed > 65535) {
      console.log("  Port must be a number between 1024 and 65535.");
      continue;
    }
    if (usedPorts.includes(parsed) && parsed !== suggestedPort) {
      const override = await confirm(rl, `  Port ${parsed} is already used. Use it anyway?`, false);
      if (!override) continue;
    }
    port = parsed;
    break;
  }

  // Step 6: Accent color
  const available = unusedAccents(usedAccents);
  if (available.length > 0) {
    console.log("  Available accent colors:");
    available.forEach((c, i) => console.log(`    ${i + 1}. ${c} — ${KNOWN_ACCENTS[c]}`));
    console.log(`    c. Enter custom hex`);
  }
  let accent = available[0] ?? "#888888";
  while (true) {
    const accentStr = await ask(
      rl,
      `6. Accent color (pick number from list above, or enter hex)`,
      available.length > 0 ? "1" : "#888888",
    );
    if (/^\d+$/.test(accentStr)) {
      const idx = parseInt(accentStr, 10) - 1;
      if (idx >= 0 && idx < available.length) { accent = available[idx]; break; }
      console.log(`  Enter a number between 1 and ${available.length}, or a hex color.`);
    } else if (/^#[0-9a-fA-F]{6}$/.test(accentStr)) {
      accent = accentStr.toLowerCase();
      break;
    } else if (accentStr === "c" || accentStr === "C") {
      const customHex = await ask(rl, "  Enter hex color (e.g. #FF5722)");
      if (/^#[0-9a-fA-F]{6}$/.test(customHex)) { accent = customHex.toLowerCase(); break; }
      console.log("  Invalid hex. Use format #RRGGBB.");
    } else if (accentStr === "") {
      break; // use default
    } else {
      console.log("  Enter a number from the list or a hex color like #FF5722.");
    }
  }

  // Step 7: Routes
  const routes: RouteMapping[] = [];
  console.log("\n  Routes (paid API endpoints). At least one is recommended.");
  let addRoute = await confirm(rl, "  Add a route?", true);
  while (addRoute) {
    console.log("  Methods: GET, POST, PUT, DELETE, PATCH");
    const method = (await ask(rl, "  Method", "POST")).toUpperCase();
    let path = await ask(rl, "  Path (e.g. /v1/call)", "/v1/" + id);
    if (!path.startsWith("/")) path = "/" + path;
    const routeStr = `${method} ${path}`;
    const opIdSuggestion = pathToOperationId(path);
    const reqTypeSuggestion = opIdToTypeName(opIdSuggestion, "Request");
    const resTypeSuggestion = opIdToTypeName(opIdSuggestion, "Response");
    const priceInput = await ask(rl, "  Price (e.g. $0.01, or 'free')", "$0.01");
    const price = priceInput === "free" ? "free" : priceInput.startsWith("$") ? priceInput : `$${priceInput}`;
    const routeDescription = await ask(rl, "  Summary (e.g. 'Make a phone call')", opIdSuggestion.replace(/_/g, " "));
    const operation_id = await ask(rl, "  Operation ID", opIdSuggestion);
    const reqType = await ask(rl, "  Request type name", reqTypeSuggestion);
    const resType = await ask(rl, "  Response type name", resTypeSuggestion);

    routes.push({
      route: routeStr,
      request: reqType || null,
      response: resType || reqTypeSuggestion.replace("Request", "Response"),
      status: 200,
      description: routeDescription,
      notes: undefined,
    });

    // Record pricing
    addRoute = await confirm(rl, "  Add another route?", false);
  }

  // Step 8: Providers
  const providers: ProviderConfig[] = [];
  console.log("\n  Providers (optional — upstream APIs this primitive wraps).");
  let addProvider = await confirm(rl, "  Add a provider?", false);
  while (addProvider) {
    const vendorName = await ask(rl, "  Vendor name (e.g. Twilio)");
    const envVarsRaw = await ask(rl, "  Env vars (comma-separated, e.g. TWILIO_API_KEY)", `${id.toUpperCase()}_API_KEY`);
    const envVars = envVarsRaw.split(",").map((v) => v.trim()).filter(Boolean);
    const vendorUrl = await ask(rl, "  Vendor URL (optional)");

    providers.push({
      name: vendorName.toLowerCase(),
      env_key: envVars[0],
      description: vendorUrl || undefined,
    });

    addProvider = await confirm(rl, "  Add another provider?", false);
  }

  // Build env list: always include standard env vars + any provider vars
  const providerEnvVars = providers.flatMap((p) => (p.env_key ? [p.env_key] : []));
  const env = [
    "PRIM_PAY_TO",
    "PRIM_NETWORK",
    ...providerEnvVars,
    "WALLET_INTERNAL_URL",
  ].filter((v, i, a) => a.indexOf(v) === i);

  // Build pricing rows from routes
  const pricing: PricingRow[] = routes
    .filter((r) => {
      // price is stored in routePrices — but at wizard time we need to pull from route definition
      return true;
    })
    .map((r, i) => ({
      op: r.description,
      price: "$0.01", // wizard doesn't capture per-route price in PricingRow yet; use route price
      note: "Per request",
    }));

  // Assemble prim object
  const prim: PrimYaml = {
    id,
    name,
    endpoint: `${id}.prim.sh`,
    status: "building",
    type,
    description,
    port,
    accent,
    accent_dim: dimAccent(accent),
    accent_glow: accentGlow(accent),
    env,
    pricing,
    providers: providers.length > 0 ? providers : undefined,
    routes_map: routes.length > 0 ? routes : undefined,
  };

  // Step 9: Preview + confirm
  const yamlStr = stringifyYaml(prim, { lineWidth: 120 });
  console.log("\n  ─── prim.yaml preview ───────────────────────────────────────\n");
  console.log(yamlStr.split("\n").map((l) => "  " + l).join("\n"));
  console.log("  ────────────────────────────────────────────────────────────\n");

  const confirmed = await confirm(rl, `  Write packages/${id}/prim.yaml?`, true);
  rl.close();

  if (!confirmed) {
    console.log("  Aborted. No files written.");
    return null;
  }

  return { prim, yamlStr };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function scaffold(id: string, prim: PrimYaml, force: boolean, root: string): Promise<void> {
  const pkgDir = join(root, "packages", id);
  const routePrices = buildRoutePriceMap(prim.routes_map ?? [], prim.pricing);

  console.log(`Scaffolding ${prim.name} (packages/${id})...`);

  // package.json
  writeFile(join(pkgDir, "package.json"), genPackageJson(prim), force);

  // tsconfig.json
  writeFile(join(pkgDir, "tsconfig.json"), genTsconfig(), force);

  // vitest.config.ts
  writeFile(join(pkgDir, "vitest.config.ts"), genVitestConfig(), force);

  // install.sh
  writeFile(join(pkgDir, "install.sh"), genInstallSh(prim), force);

  // src/index.ts
  writeFile(join(pkgDir, "src", "index.ts"), genIndexTs(prim, routePrices), force);

  // src/api.ts
  writeFile(join(pkgDir, "src", "api.ts"), genApiTs(prim), force);

  // src/service.ts
  writeFile(join(pkgDir, "src", "service.ts"), genServiceTs(prim), force);

  // src/provider.ts (only if providers section exists)
  const providerContent = genProviderTs(prim);
  if (providerContent) {
    writeFile(join(pkgDir, "src", "provider.ts"), providerContent, force);
  }

  // src/<vendor>.ts (only if providers section exists)
  const vendorFile = genVendorTs(prim);
  if (vendorFile) {
    writeFile(join(pkgDir, "src", vendorFile.filename), vendorFile.content, force);
  }

  // test/smoke.test.ts
  writeFile(join(pkgDir, "test", "smoke.test.ts"), genSmokeTestTs(prim, routePrices), force);

  // README.md
  writeFile(join(pkgDir, "README.md"), genReadme(prim, routePrices), force);

  console.log(`\nDone. ${written} file(s) written, ${skipped} skipped.`);
  if (written > 0) {
    console.log(`\nNext steps:`);
    console.log(`  1. Implement src/api.ts  — define request/response types`);
    console.log(`  2. Implement src/service.ts — replace TODO stubs`);
    if ((prim.providers ?? []).length > 0) {
      console.log(`  3. Implement src/${(prim.providers![0].name ?? "vendor").toLowerCase().replace(/\s+/g, "")}.ts — provider client`);
    }
    console.log(`  4. Update test/smoke.test.ts — fill in MOCK_RESPONSE`);
    console.log(`  5. pnpm -F @primsh/${id} check`);
  }
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const interactive = args.includes("--interactive");

const ROOT = resolve(import.meta.dir, "..");

if (interactive) {
  // Interactive wizard mode
  const result = await runWizard(ROOT);
  if (!result) process.exit(0);

  const { prim, yamlStr } = result;
  const pkgDir = join(ROOT, "packages", prim.id);

  // Write prim.yaml
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "prim.yaml"), yamlStr, "utf-8");
  console.log(`\n  Wrote packages/${prim.id}/prim.yaml`);

  // Offer to scaffold
  const rl2 = readline.createInterface({ input, output });
  const doScaffold = await rl2.question(`\n  Run scaffolder now? (Y/n): `);
  rl2.close();

  if (doScaffold.trim().toLowerCase() !== "n") {
    await scaffold(prim.id, prim, force, ROOT);
  } else {
    console.log(`\n  Run later: pnpm create-prim ${prim.id}`);
  }
} else {
  // Non-interactive mode: read existing prim.yaml and scaffold
  const id = args.find((a) => !a.startsWith("--"));

  if (!id) {
    console.error("Usage: pnpm create-prim <id> [--force]");
    console.error("       pnpm create-prim --interactive");
    process.exit(1);
  }

  const pkgDir = join(ROOT, "packages", id);
  const yamlPath = join(pkgDir, "prim.yaml");

  if (!existsSync(yamlPath)) {
    console.error(`Error: prim.yaml not found at ${yamlPath}`);
    console.error(`Create packages/${id}/prim.yaml first, then re-run.`);
    console.error(`Or run: pnpm create-prim --interactive`);
    process.exit(1);
  }

  const raw = readFileSync(yamlPath, "utf-8");
  const prim = parseYaml(raw) as PrimYaml;

  if (!prim.id || !prim.name || !prim.port) {
    console.error("Error: prim.yaml must have id, name, and port fields");
    process.exit(1);
  }

  await scaffold(id, prim, force, ROOT);
}
