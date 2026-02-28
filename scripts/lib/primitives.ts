/**
 * scripts/lib/primitives.ts — Shared primitives loader
 *
 * Single source of truth for loading and filtering the primitives registry.
 * Used by gen-prims.ts, pre-deploy.ts, launch-status.ts, gate-check.ts, deploy-prim.ts.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

// ── Types ──────────────────────────────────────────────────────────────────

export type PrimStatus = "idea" | "planning" | "building" | "testing" | "live" | "mainnet";

export interface PricingRow {
  op: string;
  price: string;
  note?: string;
}

export interface GateConfig {
  coverage_threshold?: number; // default 80
  allow_todo?: boolean; // default false
  skip_smoke?: boolean; // default false
  approved_by?: string; // required for testing → live
}

export interface DeployConfig {
  max_body_size?: string; // default "1MB"
  systemd_after?: string[]; // extra After= units
  extra_caddy?: string[]; // additional Caddy blocks
  access_log?: boolean; // enable JSON access log in Caddy
}

export interface RouteQueryParam {
  name: string;
  type: string;
  description: string;
}

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
  query_params?: RouteQueryParam[];
  errors?: RouteError[];
  operation_id?: string;
  request_type?: string | null;
  response_type?: string | null;
}

export type ProviderStatus = "active" | "planned" | "deprecated";

export interface Provider {
  name: string;
  env: string[];
  status: ProviderStatus;
  default: boolean;
  url?: string;
}

export interface Interfaces {
  mcp: boolean;
  cli: boolean;
  openai: boolean;
  rest: boolean;
}

export interface FactoryConfig {
  max_body_size?: string; // default "1MB"
  metrics?: boolean; // default true
  free_service?: boolean; // default false
}

export type PrimCategory =
  | "crypto"
  | "compute"
  | "storage"
  | "comms"
  | "intelligence"
  | "identity"
  | "ops"
  | "physical"
  | "meta";

/** Category → accent color. Single source of truth for the color system. */
export const CATEGORY_COLORS: Record<PrimCategory, string> = {
  crypto: "#00ff88", // neon green
  compute: "#4DD0E1", // cyan
  storage: "#FFB74D", // amber
  comms: "#6C8EFF", // blue
  intelligence: "#B39DDB", // purple
  identity: "#FFC107", // gold
  ops: "#FF3D00", // orange
  physical: "#F48FB1", // pink
  meta: "#E0E0E0", // white/silver
};

/** Map existing `type` values to categories */
export const TYPE_TO_CATEGORY: Record<string, PrimCategory> = {
  crypto: "crypto",
  defi: "crypto",
  testnet: "crypto",
  payments: "crypto",
  compute: "compute",
  execution: "compute",
  scheduler: "compute",
  scheduling: "compute",
  deploy: "compute",
  storage: "storage",
  memory: "storage",
  secrets: "storage",
  email: "comms",
  messaging: "comms",
  voice: "comms",
  phone: "comms",
  browser: "comms",
  intelligence: "intelligence",
  ai: "intelligence",
  search: "intelligence",
  documentation: "intelligence",
  auth: "identity",
  oauth: "identity",
  identity: "identity",
  domains: "identity",
  observability: "ops",
  tracing: "ops",
  logistics: "ops",
  coordination: "ops",
  social: "ops",
  labor: "physical",
  commerce: "physical",
  location: "physical",
  maps: "physical",
  advertising: "physical",
  legal: "physical",
  compliance: "physical",
  meta: "meta",
};

export interface Primitive {
  id: string;
  name: string;
  endpoint?: string;
  status: PrimStatus;
  type: string;
  category?: PrimCategory;
  card_class: string;
  description: string;
  port?: number;
  order: number;
  phantom?: boolean;
  show_on_index?: boolean;
  env?: string[];
  pricing?: PricingRow[];
  gates?: GateConfig;
  deploy?: DeployConfig;
  quick_start?: string[];
  tips?: string[];
  limits?: string[];
  ownership?: string;
  routes_map?: RouteMapping[];
  providers?: Provider[];
  interfaces?: Interfaces;
  factory?: FactoryConfig;
  accent?: string;
  accent_dim?: string;
  accent_glow?: string;
}

// ── Loader ─────────────────────────────────────────────────────────────────

export function loadPrimitives(root?: string): Primitive[] {
  const ROOT = root ?? resolve(new URL("../..", import.meta.url).pathname);

  // 1. Load root registry
  const rootYaml = readFileSync(join(ROOT, "primitives.yaml"), "utf8");
  const rootData = parseYaml(rootYaml) as { primitives: Partial<Primitive>[] };
  const rootMap = new Map<string, Partial<Primitive>>();
  for (const p of rootData.primitives) {
    if (p.id) rootMap.set(p.id, p);
  }

  // 2. Load package yamls, merge over root
  const packagesDir = join(ROOT, "packages");
  const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dir of packageDirs) {
    const yamlPath = join(packagesDir, dir, "prim.yaml");
    if (!existsSync(yamlPath)) continue;
    const data = parseYaml(readFileSync(yamlPath, "utf8")) as Partial<Primitive>;
    if (!data.id) continue;
    const base = rootMap.get(data.id) ?? {};
    rootMap.set(data.id, { ...base, ...data });
  }

  // 3. Sort by order, apply defaults
  return Array.from(rootMap.values())
    .map((p) => ({
      show_on_index: true,
      phantom: false,
      ...p,
    }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id)) as Primitive[];
}

// ── Defaults ───────────────────────────────────────────────────────────────

export function getDeployConfig(p: Primitive): Required<DeployConfig> {
  return {
    max_body_size: p.deploy?.max_body_size ?? "1MB",
    systemd_after: p.deploy?.systemd_after ?? [],
    extra_caddy: p.deploy?.extra_caddy ?? [],
  };
}

export function getFactoryConfig(p: Primitive): Required<FactoryConfig> {
  return {
    max_body_size: p.factory?.max_body_size ?? "1MB",
    metrics: p.factory?.metrics ?? true,
    free_service: p.factory?.free_service ?? false,
  };
}

export function getGateOverrides(p: Primitive): Required<GateConfig> {
  return {
    coverage_threshold: p.gates?.coverage_threshold ?? 80,
    allow_todo: p.gates?.allow_todo ?? false,
    skip_smoke: p.gates?.skip_smoke ?? false,
    approved_by: p.gates?.approved_by ?? "",
  };
}

// ── Filters ────────────────────────────────────────────────────────────────

export type InterfaceSurface = "mcp" | "cli" | "openai" | "rest";

/** Primitives eligible for a given integration surface (has OpenAPI spec + interface enabled) */
export function primsForInterface(surface: InterfaceSurface, root?: string): Primitive[] {
  const ROOT = root ?? resolve(new URL("../..", import.meta.url).pathname);
  const prims = loadPrimitives(root);
  return prims.filter((p) => {
    // Must have an OpenAPI spec
    if (!existsSync(join(ROOT, "specs/openapi", `${p.id}.yaml`))) return false;
    // Interface flag defaults to true if absent
    return p.interfaces?.[surface] !== false;
  });
}

/** Primitives on VPS (status = live or mainnet) */
export function deployed(prims: Primitive[]): Primitive[] {
  return prims.filter((p) => p.status === "live" || p.status === "mainnet");
}

/** Primitives deployed to Base mainnet (status = mainnet) */
export function mainnetDeployed(prims: Primitive[]): Primitive[] {
  return prims.filter((p) => p.status === "mainnet");
}

/** Primitives that have a packages/<id>/ directory */
export function withPackage(prims: Primitive[], root: string): Primitive[] {
  const packagesDir = join(root, "packages");
  return prims.filter((p) => existsSync(join(packagesDir, p.id)));
}
