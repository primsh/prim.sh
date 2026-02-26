// site/serve.ts — SSR site server for prim.sh
// Usage: bun run site/serve.ts
// Port 3000

import { parse } from "yaml";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { render, type PrimConfig } from "./template.ts";

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = resolve(import.meta.dir, "..");

// ── static pages (not converted to YAML) ─────────────────────────────────────

const STATIC_ROUTES: Record<string, string> = {
  "/": join(ROOT, "site/index.html"),
  "/terms": join(ROOT, "site/terms/index.html"),
  "/privacy": join(ROOT, "site/privacy/index.html"),
  "/access": join(ROOT, "site/access/index.html"),
  "/install": join(ROOT, "site/install.sh"),
  "/install.sh": join(ROOT, "site/install.sh"),
};

// ── YAML loading ──────────────────────────────────────────────────────────────

/** Load a prim.yaml. Package dir wins over site dir. */
function loadPrimYaml(id: string): PrimConfig | null {
  const candidates = [
    join(ROOT, `packages/${id}/prim.yaml`),
    join(ROOT, `site/${id}/prim.yaml`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return parse(readFileSync(p, "utf-8")) as PrimConfig;
      } catch (e) {
        console.error(`[serve] Failed to parse ${p}:`, e);
      }
    }
  }
  return null;
}

/** Discover all prim IDs at startup */
function discoverPrimIds(): string[] {
  const ids = new Set<string>();

  // Packages dir
  const pkgDirs = readdirSync(join(ROOT, "packages"));
  for (const dir of pkgDirs) {
    if (existsSync(join(ROOT, `packages/${dir}/prim.yaml`))) ids.add(dir);
  }

  // Site dir
  const siteDirs = readdirSync(join(ROOT, "site"));
  for (const dir of siteDirs) {
    if (existsSync(join(ROOT, `site/${dir}/prim.yaml`))) ids.add(dir);
  }

  return [...ids];
}

// Startup: load all YAMLs into memory
const primIds = discoverPrimIds();
const primCache = new Map<string, PrimConfig>();
for (const id of primIds) {
  const cfg = loadPrimYaml(id);
  if (cfg) {
    primCache.set(id, cfg);
    console.log(`[serve] loaded ${id} (${cfg.status})`);
  }
}
console.log(`[serve] ${primCache.size} prims loaded, listening on :${PORT}`);

// ── MIME types ────────────────────────────────────────────────────────────────

function mimeFor(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".sh")) return "text/plain; charset=utf-8";
  if (path.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "text/yaml";
  return "application/octet-stream";
}

function serveFile(filePath: string, extra?: Record<string, string>): Response {
  if (!existsSync(filePath)) return new Response("Not Found", { status: 404 });
  const file = Bun.file(filePath);
  return new Response(file, {
    headers: { "Content-Type": mimeFor(filePath), ...(extra ?? {}) },
  });
}

// ── server ────────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Static exact routes
    if (STATIC_ROUTES[pathname]) {
      return serveFile(STATIC_ROUTES[pathname]);
    }

    // /assets/*
    if (pathname.startsWith("/assets/")) {
      return serveFile(join(ROOT, "site", pathname));
    }

    // /pricing.json
    if (pathname === "/pricing.json") {
      return serveFile(join(ROOT, "site/pricing.json"));
    }

    // /llms.txt
    if (pathname === "/llms.txt") {
      return serveFile(join(ROOT, "site/llms.txt"));
    }

    // /<prim-id>/llms.txt
    const llmsMatch = pathname.match(/^\/([^/]+)\/llms\.txt$/);
    if (llmsMatch) {
      const [, id] = llmsMatch;
      return serveFile(join(ROOT, `site/${id}/llms.txt`));
    }

    // /<prim-id> → render from YAML
    const primMatch = pathname.match(/^\/([^/]+)\/?$/);
    if (primMatch) {
      const [, id] = primMatch;
      const cfg = primCache.get(id);
      if (cfg) {
        const html = render(cfg);
        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=300",
          },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[serve] running at http://localhost:${server.port}`);
