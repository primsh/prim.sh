/// <reference types="bun-types" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";

const app = new Hono();
const PORT = Number(process.env.PORT ?? 3020);
const PUBLIC_DIR = join(import.meta.dir, "..", "public");

function serveFile(name: string, contentType: string) {
  const content = readFileSync(join(PUBLIC_DIR, name), "utf-8");
  return new Response(content, {
    headers: { "Content-Type": contentType },
  });
}

app.get("/", (c) => {
  return c.json({ service: "pay.prim.sh", status: "ok" });
});

app.get("/fund", () => serveFile("index.html", "text/html; charset=utf-8"));
app.get("/pay.js", () => serveFile("pay.js", "application/javascript; charset=utf-8"));
app.get("/style.css", () => serveFile("style.css", "text/css; charset=utf-8"));

export default app;

Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`[pay] listening on :${PORT}`);
