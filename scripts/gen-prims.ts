#!/usr/bin/env bun
/**
 * gen-prims.ts — Primitives codegen
 *
 * Reads packages/<id>/prim.yaml (built primitives) + root primitives.yaml (all),
 * merges them, and regenerates marker-bounded sections in target files.
 *
 * Usage:
 *   bun scripts/gen-prims.ts          # regenerate all targets
 *   bun scripts/gen-prims.ts --check  # diff against disk, exit 1 if any file would change
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadPrimitives, deployed, type Primitive } from "./lib/primitives.js";
import { parseApiFile } from "./lib/parse-api.js";
import { parseRoutePrices, renderLlmsTxt } from "./lib/render-llms-txt.js";
import { renderSkillsJson } from "./lib/render-skills.js";

const ROOT = resolve(import.meta.dir, "..");
const CHECK_MODE = process.argv.includes("--check");

// ── Marker injection ───────────────────────────────────────────────────────

type CommentStyle = "html" | "js" | "bash";

function inject(
  filePath: string,
  section: string,
  content: string,
  style: CommentStyle = "html"
): { changed: boolean; result: string; missing?: boolean } {
  const [open, close] =
    style === "html"
      ? [`<!-- BEGIN:PRIM:${section} -->`, `<!-- END:PRIM:${section} -->`]
      : style === "bash"
        ? [`# BEGIN:PRIM:${section}`, `# END:PRIM:${section}`]
        : [`// BEGIN:PRIM:${section}`, `// END:PRIM:${section}`];

  const original = readFileSync(filePath, "utf8");
  const openIdx = original.indexOf(open);
  const closeIdx = original.indexOf(close);

  if (openIdx === -1 || closeIdx === -1) {
    return { changed: false, result: original, missing: true };
  }

  const before = original.slice(0, openIdx + open.length);
  const after = original.slice(closeIdx);
  const result = `${before}\n${content}\n${after}`;
  const changed = result !== original;
  return { changed, result };
}

function applyOrCheck(filePath: string, section: string, content: string, style: CommentStyle = "html", required = true): void {
  const { changed, result, missing } = inject(filePath, section, content, style);
  if (missing) {
    if (required) {
      console.error(`  ✗ ${filePath} [${section}] missing markers — run pnpm gen:prims after adding them`);
      anyFailed = true;
    } else {
      console.log(`  – ${filePath} [${section}] no markers (skipped)`);
    }
    return;
  }
  if (CHECK_MODE) {
    if (changed) {
      console.error(`  ✗ ${filePath} [${section}] is out of date — run pnpm gen:prims`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${filePath} [${section}]`);
    }
  } else {
    writeFileSync(filePath, result);
    console.log(`  ${changed ? "↺" : "✓"} ${filePath} [${section}]`);
  }
}

let anyFailed = false;

function applyFullFile(filePath: string, content: string): void {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  const changed = existing !== content;
  if (CHECK_MODE) {
    if (changed) {
      console.error(`  ✗ ${filePath} is out of date — run pnpm gen:prims`);
      anyFailed = true;
    } else {
      console.log(`  ✓ ${filePath}`);
    }
  } else {
    writeFileSync(filePath, content);
    console.log(`  ${changed ? "↺" : "✓"} ${filePath}`);
  }
}

// ── Generators ─────────────────────────────────────────────────────────────

function genCards(prims: Primitive[]): string {
  const cards = prims.filter((p) => p.show_on_index !== false);
  return cards
    .map((p) => {
      const isLive = p.status === "live" || p.status === "testing";
      const cls = [
        "product",
        p.card_class,
        !isLive && !p.phantom ? "phantom" : "",
        p.phantom ? "phantom" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const link = isLive
        ? `      <a href="/${p.id}" class="product-link">→ ${p.name}</a>`
        : `      <span class="phantom-label">phantom</span>`;

      return `    <div class="${cls}">
      <div class="product-name">${p.name}</div>
      <div class="product-type">${p.type}</div>
      <div class="product-desc">${p.description}</div>
${link}
    </div>`;
    })
    .join("\n");
}

function genLlmsTxtSections(prims: Primitive[]): string {
  const live = prims.filter((p) => p.status === "live");
  const built = prims.filter((p) => p.status === "building" || p.status === "testing");
  const planned = prims.filter((p) => p.status === "idea" || p.status === "planning");

  const fmtLive = (p: Primitive) =>
    `- ${p.name} — ${p.endpoint ?? `${p.id}.prim.sh`} — ${p.description}`;
  const fmtOther = (p: Primitive) => `- ${p.name} — ${p.description}`;

  return [
    `## Live Primitives\n\n${live.map(fmtLive).join("\n")}`,
    `## Built (Not Yet Deployed)\n\n${built.length ? built.map(fmtOther).join("\n") : "(none)"}`,
    `## Planned Primitives\n\n${planned.map(fmtOther).join("\n")}`,
  ].join("\n\n");
}

function genReadmeTable(prims: Primitive[]): string {
  const rows = prims
    .filter((p) => p.show_on_index !== false)
    .map((p) => {
      const statusLabel =
        p.status === "live"
          ? "Live"
          : p.status === "building" || p.status === "testing"
            ? "Built"
            : "Phantom";
      const link = p.endpoint ? `[${p.name}](https://${p.endpoint})` : p.name;
      return `| ${link} | ${p.description} | ${statusLabel} |`;
    });
  return `| Primitive | What it does | Status |\n|-----------|-------------|--------|\n${rows.join("\n")}`;
}

function genPreDeployEnvs(prims: Primitive[]): string {
  const built = prims.filter((p) => p.env && p.env.length > 0);
  const entries = built
    .map((p) => `  ${p.id}: [${p.env!.map((e) => `"${e}"`).join(", ")}],`)
    .join("\n");
  return `const REQUIRED_ENV: Record<Primitive, string[]> = {\n${entries}\n};`;
}

function genStatusBadge(p: Primitive): string {
  const labels: Record<string, string> = {
    live: "● Live",
    testing: "○ Built — testing",
    building: "○ Built — deploy pending",
    planning: "◌ In planning",
    idea: "◌ Phantom",
  };
  const classes: Record<string, string> = {
    live: "status-live",
    testing: "status-built",
    building: "status-built",
    planning: "status-building",
    idea: "status-phantom",
  };
  const label = labels[p.status] ?? p.status;
  const cls = classes[p.status] ?? "status-phantom";
  return `    <span class="badge ${cls}">${label}</span>`;
}

function genPricingRows(p: Primitive): string {
  if (!p.pricing || p.pricing.length === 0) return "";
  return p.pricing
    .map((row) => `      <tr><td>${row.op}</td><td>${row.price}</td><td>${row.note ?? ""}</td></tr>`)
    .join("\n");
}

function genBashServices(prims: Primitive[]): string {
  const ids = deployed(prims).map((p) => p.id);
  return `SERVICES=(${ids.join(" ")})`;
}

function genBashEndpoints(prims: Primitive[]): string {
  const lines = deployed(prims).map((p) => {
    const host = p.endpoint ?? `${p.id}.prim.sh`;
    return `  "https://${host}"`;
  });
  return `ENDPOINTS=(\n${lines.join("\n")}\n)`;
}

// ── Main ───────────────────────────────────────────────────────────────────

const prims = loadPrimitives();
console.log(`Loaded ${prims.length} primitives`);
console.log(CHECK_MODE ? "Mode: check\n" : "Mode: generate\n");

// ── Port uniqueness check ─────────────────────────────────────────────────
{
  const portMap = new Map<number, string[]>();
  for (const p of prims) {
    if (!p.port) continue;
    const owners = portMap.get(p.port) ?? [];
    owners.push(p.id);
    portMap.set(p.port, owners);
  }
  const conflicts = [...portMap.entries()].filter(([, ids]) => ids.length > 1);
  if (conflicts.length > 0) {
    for (const [port, ids] of conflicts) {
      console.error(`  ✗ Port ${port} claimed by: ${ids.join(", ")}`);
    }
    console.error("\nPort conflict detected. Each primitive must have a unique port.");
    process.exit(1);
  }
}

// 1. site/index.html — cards grid
applyOrCheck(join(ROOT, "site/index.html"), "CARDS", genCards(prims));

// 2. site/llms.txt — status sections
applyOrCheck(join(ROOT, "site/llms.txt"), "STATUS", genLlmsTxtSections(prims));

// 3. README.md — primitive table
applyOrCheck(join(ROOT, "README.md"), "PRIMS", genReadmeTable(prims));

// 4. scripts/pre-deploy.ts — env arrays
applyOrCheck(join(ROOT, "scripts/pre-deploy.ts"), "ENV", genPreDeployEnvs(prims), "js");

// 5. deploy/prim/deploy.sh — SERVICES array
applyOrCheck(join(ROOT, "deploy/prim/deploy.sh"), "SERVICES", genBashServices(prims), "bash");

// 6. deploy/prim/setup.sh — SERVICES array
applyOrCheck(join(ROOT, "deploy/prim/setup.sh"), "SERVICES", genBashServices(prims), "bash");

// 7. deploy/prim/healthcheck.sh — ENDPOINTS array
applyOrCheck(join(ROOT, "deploy/prim/healthcheck.sh"), "ENDPOINTS", genBashEndpoints(prims), "bash");

// 8. Per-page status badge + pricing
for (const p of prims) {
  const pagePath = join(ROOT, "site", p.id, "index.html");
  if (!existsSync(pagePath)) continue;
  applyOrCheck(pagePath, "STATUS", genStatusBadge(p), "html", false);
  if (p.pricing && p.pricing.length > 0) {
    applyOrCheck(pagePath, "PRICING", genPricingRows(p), "html", false);
  }
}

// 9. Per-prim llms.txt — generated from routes_map + api.ts
const primsWithRoutes = prims.filter((p) => p.routes_map && p.routes_map.length > 0);
for (const p of primsWithRoutes) {
  const apiPath = join(ROOT, "packages", p.id, "src/api.ts");
  const indexPath = join(ROOT, "packages", p.id, "src/index.ts");
  const llmsPath = join(ROOT, "site", p.id, "llms.txt");
  if (!existsSync(apiPath)) {
    console.log(`  – site/${p.id}/llms.txt (no api.ts, skipped)`);
    continue;
  }
  const sitePrimDir = join(ROOT, "site", p.id);
  if (!existsSync(sitePrimDir)) {
    console.log(`  – site/${p.id}/llms.txt (no site dir, skipped)`);
    continue;
  }
  const parsedApi = parseApiFile(apiPath);
  const routePrices = parseRoutePrices(indexPath);
  const content = renderLlmsTxt(p, parsedApi, routePrices);
  applyFullFile(llmsPath, content);
}

// 10. site/skills.json — machine-readable skill registry
{
  const skillsContent = renderSkillsJson(prims);
  const skillsPath = join(ROOT, "site/skills.json");
  if (CHECK_MODE) {
    const existing = existsSync(skillsPath) ? readFileSync(skillsPath, "utf8") : null;
    if (existing) {
      // Compare ignoring `generated` timestamp (always changes)
      const existingParsed = JSON.parse(existing);
      const newParsed = JSON.parse(skillsContent);
      const matches =
        JSON.stringify({ ...existingParsed, generated: "" }) ===
        JSON.stringify({ ...newParsed, generated: "" });
      if (!matches) {
        console.error("  ✗ site/skills.json is out of date — run pnpm gen:prims");
        anyFailed = true;
      } else {
        console.log("  ✓ site/skills.json");
      }
    } else {
      console.error("  ✗ site/skills.json missing — run pnpm gen:prims");
      anyFailed = true;
    }
  } else {
    applyFullFile(skillsPath, skillsContent);
  }
}

// 11. site/llms-full.txt — concatenation of root llms.txt + all per-prim llms.txt
{
  const rootLlms = readFileSync(join(ROOT, "site/llms.txt"), "utf8");
  const sections = [rootLlms.trimEnd()];
  for (const p of prims) {
    const primLlmsPath = join(ROOT, "site", p.id, "llms.txt");
    if (!existsSync(primLlmsPath)) continue;
    const content = readFileSync(primLlmsPath, "utf8").trimEnd();
    if (content) sections.push(content);
  }
  const fullContent = sections.join("\n\n---\n\n") + "\n";
  applyFullFile(join(ROOT, "site/llms-full.txt"), fullContent);
}

// 12. site/sitemap.xml
{
  const BASE_URL = "https://prim.sh";
  const staticPages = ["/", "/access", "/terms", "/privacy", "/llms.txt", "/llms-full.txt", "/pricing.json", "/discovery.json"];
  const urls: string[] = [];

  for (const page of staticPages) {
    urls.push(`  <url><loc>${BASE_URL}${page}</loc></url>`);
  }

  for (const p of prims) {
    const pagePath = join(ROOT, "site", p.id, "index.html");
    if (!existsSync(pagePath)) continue;
    urls.push(`  <url><loc>${BASE_URL}/${p.id}/</loc></url>`);
    const llmsPath = join(ROOT, "site", p.id, "llms.txt");
    if (existsSync(llmsPath)) {
      urls.push(`  <url><loc>${BASE_URL}/${p.id}/llms.txt</loc></url>`);
    }
  }

  // Also include per-prim llms.txt even without an index.html page
  for (const p of prims) {
    const pagePath = join(ROOT, "site", p.id, "index.html");
    if (existsSync(pagePath)) continue; // already handled above
    const llmsPath = join(ROOT, "site", p.id, "llms.txt");
    if (existsSync(llmsPath)) {
      urls.push(`  <url><loc>${BASE_URL}/${p.id}/llms.txt</loc></url>`);
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  applyFullFile(join(ROOT, "site/sitemap.xml"), sitemap);
}

// 13. site/pricing.json — generated from prim.yaml pricing data
{
  const builtPrims = prims.filter(
    (p) => (p.status === "live" || p.status === "building" || p.status === "testing") && p.pricing && p.pricing.length > 0
  );

  const services = builtPrims.map((p) => {
    const endpoint = p.endpoint ?? `${p.id}.prim.sh`;
    const routes: { method: string; path: string; price_usdc: string; description: string }[] = [];

    // If routes_map exists, generate per-route pricing from it
    if (p.routes_map && p.routes_map.length > 0) {
      // Build a price lookup from pricing rows (op → price string)
      // Try to match routes to pricing ops; fall back to a default price
      const defaultPrice = p.pricing!.find((r) => r.op.toLowerCase().includes("read") || r.op.toLowerCase().includes("api call"));
      const defaultPriceStr = defaultPrice ? defaultPrice.price.replace("$", "") : "0.001";

      for (const rm of p.routes_map) {
        const [method, path] = rm.route.split(" ", 2);
        // Find matching pricing row
        let price = defaultPriceStr;
        for (const pr of p.pricing!) {
          const opLower = pr.op.toLowerCase();
          const descLower = rm.description.toLowerCase();
          const routeLower = rm.route.toLowerCase();
          if (
            descLower.includes(opLower) ||
            opLower.includes(method.toLowerCase()) ||
            (opLower.includes("deploy") && descLower.includes("deploy")) ||
            (opLower.includes("create") && (descLower.includes("create") || method === "POST")) ||
            (opLower.includes("mint") && descLower.includes("mint")) ||
            (opLower.includes("pool") && descLower.includes("pool"))
          ) {
            price = pr.price.replace("$", "");
            break;
          }
        }
        routes.push({
          method,
          path: path.replace(/:(\w+)/g, "{$1}"),
          price_usdc: price,
          description: rm.description,
        });
      }
    } else {
      // No routes_map: emit one row per pricing entry
      for (const pr of p.pricing!) {
        routes.push({
          method: "—",
          path: "—",
          price_usdc: pr.price.replace("$", "").replace("free", "0"),
          description: `${pr.op}${pr.note ? ` (${pr.note})` : ""}`,
        });
      }
    }

    return { service: endpoint, description: p.description, routes };
  });

  const pricingJson = JSON.stringify(
    {
      updated: new Date().toISOString().slice(0, 10),
      currency: "USDC",
      network: "eip155:84532",
      services,
    },
    null,
    2
  ) + "\n";

  applyFullFile(join(ROOT, "site/pricing.json"), pricingJson);
}

// 14. site/discovery.json — full primitive registry for agent discovery
{
  const builtPrims = prims.filter(
    (p) => p.status === "live" || p.status === "building" || p.status === "testing"
  );

  const primitives = builtPrims.map((p) => {
    const endpoint = p.endpoint ?? `${p.id}.prim.sh`;
    const entry: Record<string, string> = {
      id: p.id,
      name: p.name,
      status: p.status,
      endpoint: `https://${endpoint}`,
      description: p.description,
    };
    // Only include llms_txt if the file exists
    const llmsPath = join(ROOT, "site", p.id, "llms.txt");
    if (existsSync(llmsPath)) {
      entry.llms_txt = `https://prim.sh/${p.id}/llms.txt`;
    }
    // Only include openapi if the spec file exists
    const openapiPath = join(ROOT, "specs/openapi", `${p.id}.yaml`);
    if (existsSync(openapiPath)) {
      entry.openapi = `https://prim.sh/openapi/${p.id}.yaml`;
    }
    return entry;
  });

  const discoveryContent = JSON.stringify(
    {
      name: "prim.sh",
      description: "The agent-native stack",
      version: "beta",
      network: "eip155:84532",
      primitives,
      discovery: {
        llms_txt: "https://prim.sh/llms.txt",
        llms_full: "https://prim.sh/llms-full.txt",
        pricing: "https://prim.sh/pricing.json",
        openai_plugin: "https://prim.sh/.well-known/ai-plugin.json",
        mcp: "https://prim.sh/.well-known/mcp.json",
        sitemap: "https://prim.sh/sitemap.xml",
      },
    },
    null,
    2
  ) + "\n";

  applyFullFile(join(ROOT, "site/discovery.json"), discoveryContent);
}

if (CHECK_MODE && anyFailed) {
  console.error("\nSome files are out of date. Run: pnpm gen:prims");
  process.exit(1);
} else if (CHECK_MODE) {
  console.log("\nAll generated files are up to date.");
} else {
  console.log("\nDone.");
}
