/**
 * scaffold.ts — Pure scaffold logic extracted from create-prim.ts
 *
 * Given a PrimYaml spec, returns a list of files to generate.
 * No side effects, no disk writes, no process.exit.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface RouteError {
  status: number;
  code: string;
  description: string;
}

export interface RouteMapping {
  route: string;
  request: string | null;
  response: string;
  status: number;
  description: string;
  notes?: string;
  errors?: RouteError[];
  /** Alternate field names used in some prim.yaml files */
  request_type?: string | null;
  response_type?: string;
}

export interface PricingRow {
  op: string;
  price: string;
  note?: string;
}

export interface ProviderConfig {
  name: string;
  env_key?: string;
  description?: string;
}

export interface PrimYaml {
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

export interface FileManifest {
  path: string;
  content: string;
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
  const path = route.replace(/^[A-Z]+\s+\/v1\//, "").replace(/^\//, "");
  return path
    .replace(/[-/]/g, "_")
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase();
}

/** Uppercase const name for routes object, e.g. "search" → "SEARCH_ROUTES" */
function routesConstName(id: string): string {
  return `${id.toUpperCase().replace(/-/g, "_")}_ROUTES`;
}

// ── Normalize route mappings ────────────────────────────────────────────────

/** Normalize route to use `request`/`response` fields (handle `request_type`/`response_type` aliases) */
function normalizeRoute(r: RouteMapping): RouteMapping {
  return {
    ...r,
    request: r.request ?? r.request_type ?? null,
    response: r.response ?? r.response_type ?? "unknown",
  };
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
    const paidPricing = (pricing ?? []).filter((p) => p.price !== "free");
    const row = paidPricing[i];
    const price = row ? row.price.replace(/\$/g, "$") : "$0.01";
    map[r.route] = price.startsWith("$") ? price : `$${price}`;
  }

  return map;
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
  const routes = (prim.routes_map ?? []).map(normalizeRoute);
  const constName = routesConstName(prim.id);
  const endpoint = prim.endpoint ?? `${prim.id}.prim.sh`;

  const serviceFns = routes.map((r) => toCamelCase(routeToOperationId(r.route)));
  const requestTypes = routes.filter((r) => r.request).map((r) => r.request as string);
  const uniqueRequestTypes = [...new Set(requestTypes)];

  const routeEntries = routes
    .map((r) => `  "${r.route}": "${routePrices[r.route] ?? "$0.01"}"`)
    .join(",\n");

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
  const routes = (prim.routes_map ?? []).map(normalizeRoute);

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
  const routes = (prim.routes_map ?? []).map(normalizeRoute);
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

  const requestTypes = [
    ...new Set(routes.filter((r) => r.request).map((r) => r.request as string)),
  ];
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

  return `${providerImport ? `${providerImport}\n` : ""}import type { ${typeImports.join(", ")} } from "./api.ts";

// ─── ServiceResult ────────────────────────────────────────────────────────────

${serviceResultType}

// ─── Service functions ────────────────────────────────────────────────────────

${fns.join("\n\n")}
`;
}

function genProviderTs(prim: PrimYaml): string | null {
  const providers = prim.providers ?? [];
  if (providers.length === 0) return null;

  const providerName = `${toPascalCase(prim.id)}Provider`;
  const providerDataName = `${toPascalCase(prim.id)}ProviderData`;

  const routes = (prim.routes_map ?? []).map(normalizeRoute);

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
  const className = `${toPascalCase(vendorName)}Client`;
  const providerName = `${toPascalCase(prim.id)}Provider`;
  const providerDataName = `${toPascalCase(prim.id)}ProviderData`;

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
  const routes = (prim.routes_map ?? []).map(normalizeRoute);
  const constName = routesConstName(prim.id);

  const firstRoute = routes[0];
  if (!firstRoute) {
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

  const serviceFns = routes.map((r) => toCamelCase(routeToOperationId(r.route)));

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
  const routes = (prim.routes_map ?? []).map(normalizeRoute);
  const endpoint = prim.endpoint ?? `${prim.id}.prim.sh`;

  const routeTable = routes
    .map((r) => `| \`${r.route}\` | ${r.description} | ${routePrices[r.route] ?? "$0.01"} |`)
    .join("\n");

  const pricingTable = (prim.pricing ?? [])
    .map((p) => `| ${p.op} | ${p.price} | ${p.note ?? ""} |`)
    .join("\n");

  const envList = (prim.env ?? []).map((e) => `- \`${e}\``).join("\n");

  return `# ${prim.name}

> ${prim.description}

Part of [prim.sh](https://prim.sh) — zero signup, one payment token, infinite primitives. x402 payment (USDC on Base) is the sole auth.

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

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Given a PrimYaml spec, returns a list of files to generate.
 * Pure function — no side effects.
 */
export function scaffoldPure(prim: PrimYaml): FileManifest[] {
  const routes = (prim.routes_map ?? []).map(normalizeRoute);
  const normalizedPrim = { ...prim, routes_map: routes };
  const routePrices = buildRoutePriceMap(routes, prim.pricing);

  const files: FileManifest[] = [
    { path: `packages/${prim.id}/package.json`, content: genPackageJson(normalizedPrim) },
    { path: `packages/${prim.id}/tsconfig.json`, content: genTsconfig() },
    { path: `packages/${prim.id}/vitest.config.ts`, content: genVitestConfig() },
    { path: `packages/${prim.id}/install.sh`, content: genInstallSh(normalizedPrim) },
    { path: `packages/${prim.id}/src/index.ts`, content: genIndexTs(normalizedPrim, routePrices) },
    { path: `packages/${prim.id}/src/api.ts`, content: genApiTs(normalizedPrim) },
    { path: `packages/${prim.id}/src/service.ts`, content: genServiceTs(normalizedPrim) },
    {
      path: `packages/${prim.id}/test/smoke.test.ts`,
      content: genSmokeTestTs(normalizedPrim, routePrices),
    },
    { path: `packages/${prim.id}/README.md`, content: genReadme(normalizedPrim, routePrices) },
  ];

  const providerContent = genProviderTs(normalizedPrim);
  if (providerContent) {
    files.push({ path: `packages/${prim.id}/src/provider.ts`, content: providerContent });
  }

  const vendorFile = genVendorTs(normalizedPrim);
  if (vendorFile) {
    files.push({
      path: `packages/${prim.id}/src/${vendorFile.filename}`,
      content: vendorFile.content,
    });
  }

  return files;
}
