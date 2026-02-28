import { resolve } from "node:path";
import type { Context } from "hono";
import { createLogger } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import { submit } from "./service.ts";
import { listFeedback, countFeedback } from "./db.ts";

const INTERNAL_KEY = process.env.PRIM_INTERNAL_KEY;

const app = createPrimApp(
  {
    serviceName: "feedback.sh",
    llmsTxtPath: import.meta.dir ? resolve(import.meta.dir, "../../../site/feedback/llms.txt") : undefined,
    routes: {},
    metricsName: "feedback.prim.sh",
    freeService: true,
    pricing: {
      routes: [
        { method: "POST", path: "/v1/submit", price_usdc: "0", description: "Submit feedback (free)" },
        { method: "GET", path: "/v1/feed", price_usdc: "0", description: "List feedback (internal)" },
      ],
    },
  },
  {},
);

const logger = createLogger("feedback.sh");

// ─── Internal auth guard ─────────────────────────────────────────────────────

function internalAuth(c: Context): Response | null {
  if (!INTERNAL_KEY) {
    return c.json({ error: { code: "not_configured", message: "Internal API not configured" } }, 501);
  }
  const key = c.req.header("x-internal-key");
  if (key !== INTERNAL_KEY) {
    return c.json({ error: { code: "unauthorized", message: "Invalid internal key" } }, 401);
  }
  return null;
}

// POST /v1/submit — Submit feedback
app.post("/v1/submit", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } }, 400);
  }

  const result = submit({
    primitive: body.primitive as string,
    endpoint: body.endpoint as string | undefined,
    type: body.type as string,
    body: body.body as string,
    wallet: body.wallet as string | undefined,
    request_id: body.request_id as string | undefined,
  });

  if (!result.ok) {
    return c.json({ error: { code: result.code, message: result.message } }, result.status as 400);
  }

  return c.json(result.data, 200);
});

// GET /v1/feed — List feedback (internal key required)
app.get("/v1/feed", (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  const primitive = c.req.query("primitive");
  const limit = Number(c.req.query("limit") || "50");
  const offset = Number(c.req.query("offset") || "0");

  const items = listFeedback({ primitive, limit, offset });
  const total = countFeedback(primitive);

  return c.json({ items, total, limit, offset }, 200);
});

export default app;
