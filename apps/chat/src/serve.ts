// SPDX-License-Identifier: Apache-2.0
// Production entry point — serves static files + API via Bun
import { resolve } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import app from "./index.ts";

const serve = new Hono();

// Static files first — serve index.html, css, js, manifest, sw
serve.use(
  "/*",
  serveStatic({
    root: resolve(import.meta.dir, "../public"),
    rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path),
  }),
);

// API routes (health, auth, chat, conversations, balance)
serve.route("/", app);

const port = Number(process.env.CHAT_PORT ?? 3020);

export default {
  port,
  fetch: serve.fetch,
};
