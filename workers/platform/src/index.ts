import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  PRIM_ADMIN_KEY: string;
  PRIM_INTERNAL_KEY: string;
  VPS_WALLET_URL: string;
  GITHUB_TOKEN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function generateCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    code += chars[b % chars.length];
  }
  return code;
}

function isAdmin(c: Parameters<Parameters<typeof app.get>[1]>[0]): boolean {
  const key = c.req.header("x-admin-key");
  return !!key && key === c.env.PRIM_ADMIN_KEY;
}

async function callVpsAllowlist(
  env: Bindings,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const url = `${env.VPS_WALLET_URL}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      "X-Internal-Key": env.PRIM_INTERNAL_KEY,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts);
}

// ─── Access requests ───────────────────────────────────────────────────────

// POST /access/request — Submit access request (public)
app.post("/access/request", async (c) => {
  let body: { wallet?: string; reason?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.wallet) {
    return c.json({ error: "Missing required field: wallet" }, 400);
  }

  const id = generateId();
  await c.env.DB.prepare(
    "INSERT INTO access_requests (id, wallet, reason) VALUES (?, ?, ?)",
  )
    .bind(id, body.wallet.toLowerCase(), body.reason ?? null)
    .run();

  return c.json({ id, status: "pending" }, 201);
});

// GET /access/requests — List pending requests (admin)
app.get("/access/requests", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "Unauthorized" }, 401);

  const status = c.req.query("status") ?? "pending";
  const result = await c.env.DB.prepare(
    "SELECT * FROM access_requests WHERE status = ? ORDER BY created_at DESC LIMIT 100",
  )
    .bind(status)
    .all();

  return c.json({ requests: result.results }, 200);
});

// POST /access/requests/:id/approve — Approve request (admin)
app.post("/access/requests/:id/approve", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT * FROM access_requests WHERE id = ?",
  )
    .bind(id)
    .first();

  if (!row) return c.json({ error: "Request not found" }, 404);
  if (row.status !== "pending") {
    return c.json({ error: `Request already ${row.status}` }, 409);
  }

  // Add wallet to VPS allowlist
  const vpsRes = await callVpsAllowlist(c.env, "POST", "/internal/allowlist/add", {
    address: row.wallet as string,
    added_by: "access_request",
    note: `Request ${id}`,
  });

  if (!vpsRes.ok) {
    return c.json({ error: "Failed to add wallet to allowlist" }, 502);
  }

  await c.env.DB.prepare(
    "UPDATE access_requests SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?",
  )
    .bind(id)
    .run();

  return c.json({ id, status: "approved", wallet: row.wallet }, 200);
});

// POST /access/requests/:id/deny — Deny request (admin)
app.post("/access/requests/:id/deny", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  let reason: string | null = null;
  try {
    const body = await c.req.json<{ reason?: string }>();
    reason = body.reason ?? null;
  } catch {
    // reason is optional
  }

  const row = await c.env.DB.prepare(
    "SELECT * FROM access_requests WHERE id = ?",
  )
    .bind(id)
    .first();

  if (!row) return c.json({ error: "Request not found" }, 404);
  if (row.status !== "pending") {
    return c.json({ error: `Request already ${row.status}` }, 409);
  }

  await c.env.DB.prepare(
    "UPDATE access_requests SET status = 'denied', reviewed_at = datetime('now'), review_note = ? WHERE id = ?",
  )
    .bind(reason, id)
    .run();

  return c.json({ id, status: "denied" }, 200);
});

// ─── Invite codes ──────────────────────────────────────────────────────────

// POST /invites — Create invite code (requires wallet proof via payment header)
app.post("/invites", async (c) => {
  // Extract wallet from payment-signature header to prove identity
  const paymentHeader = c.req.header("payment-signature") ?? c.req.header("x-payment");
  if (!paymentHeader) {
    return c.json({ error: "Wallet proof required (payment-signature header)" }, 401);
  }

  let wallet: string | undefined;
  try {
    const decoded = JSON.parse(atob(paymentHeader));
    wallet =
      decoded?.payload?.authorization?.from ??
      decoded?.authorization?.from ??
      decoded?.from;
  } catch {
    return c.json({ error: "Invalid payment header" }, 400);
  }

  if (!wallet) {
    return c.json({ error: "Could not extract wallet from payment header" }, 400);
  }

  const code = generateCode();
  await c.env.DB.prepare(
    "INSERT INTO invite_codes (code, created_by) VALUES (?, ?)",
  )
    .bind(code, wallet.toLowerCase())
    .run();

  return c.json({ code, created_by: wallet.toLowerCase() }, 201);
});

// POST /invites/redeem — Redeem invite code
app.post("/invites/redeem", async (c) => {
  let body: { code?: string; wallet?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.code || !body.wallet) {
    return c.json({ error: "Missing required fields: code, wallet" }, 400);
  }

  const row = await c.env.DB.prepare(
    "SELECT * FROM invite_codes WHERE code = ?",
  )
    .bind(body.code)
    .first();

  if (!row) return c.json({ error: "Invalid invite code" }, 404);
  if (row.redeemed_by) {
    return c.json({ error: "Invite code already redeemed" }, 409);
  }

  // Add wallet to VPS allowlist
  const vpsRes = await callVpsAllowlist(c.env, "POST", "/internal/allowlist/add", {
    address: body.wallet,
    added_by: `invite:${row.created_by}`,
    note: `Invite code ${body.code}`,
  });

  if (!vpsRes.ok) {
    return c.json({ error: "Failed to add wallet to allowlist" }, 502);
  }

  await c.env.DB.prepare(
    "UPDATE invite_codes SET redeemed_by = ?, redeemed_at = datetime('now') WHERE code = ?",
  )
    .bind(body.wallet.toLowerCase(), body.code)
    .run();

  return c.json({ ok: true, wallet: body.wallet.toLowerCase() }, 200);
});

// ─── Feedback ──────────────────────────────────────────────────────────────

// POST /feedback — Create GitHub issue
app.post("/feedback", async (c) => {
  const token = c.env.GITHUB_TOKEN;
  if (!token) {
    return c.json({ error: "Feedback not configured" }, 501);
  }

  const VALID_TYPES = ["bug", "feature", "pain_point"];

  let body: { type?: string; title?: string; body?: string; wallet?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.title || !body.body) {
    return c.json({ error: "Missing required fields: title, body" }, 400);
  }

  if (!body.wallet) {
    return c.json({ error: "Missing required field: wallet" }, 400);
  }

  if (body.type && !VALID_TYPES.includes(body.type)) {
    return c.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` }, 400);
  }

  // Verify wallet is on the allowlist
  const checkRes = await callVpsAllowlist(
    c.env,
    "GET",
    `/internal/allowlist/check?address=${encodeURIComponent(body.wallet)}`,
  );
  if (!checkRes.ok) {
    return c.json({ error: "Wallet not registered" }, 403);
  }
  const checkBody = (await checkRes.json()) as { allowed: boolean };
  if (!checkBody.allowed) {
    return c.json({ error: "Wallet not registered" }, 403);
  }

  const typeLabel = body.type ?? "feedback";
  const labels = [typeLabel, "agent-reported"];
  const issueBody = `${body.body}\n\n---\nSubmitted by: \`${body.wallet}\``;

  const ghRes = await fetch("https://api.github.com/repos/primsh/prim.sh/issues", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "prim-platform-worker",
    },
    body: JSON.stringify({
      title: body.title,
      body: issueBody,
      labels,
    }),
  });

  if (!ghRes.ok) {
    return c.json({ error: "Failed to create GitHub issue" }, 502);
  }

  const issue = (await ghRes.json()) as { number: number; html_url: string };
  return c.json({ issue_number: issue.number, url: issue.html_url }, 201);
});

export default app;
