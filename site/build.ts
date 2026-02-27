// site/build.ts — Build static dist from site/ with template substitution
// Usage: bun run site/build.ts
// Output: site-dist/index.html (placeholders replaced from brand.ts)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderFooter } from "./template.ts";
import { BRAND } from "../brand.ts";

const ROOT = resolve(import.meta.dir, "..");
const src = readFileSync(resolve(ROOT, "site/index.html"), "utf-8");
const out = src
  .replace("{{tagline}}", BRAND.tagline)
  .replace("{{sub}}", BRAND.sub)
  .replace("{{closer}}", BRAND.closer)
  .replace("{{footer}}", renderFooter("prim.sh"));

mkdirSync(resolve(ROOT, "site-dist"), { recursive: true });
writeFileSync(resolve(ROOT, "site-dist/index.html"), out);
console.log("[build] site-dist/index.html written");
