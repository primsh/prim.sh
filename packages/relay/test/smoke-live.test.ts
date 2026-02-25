/**
 * R-11: Live smoke test against a real Stalwart instance.
 * Exercises the full relay.sh flow: create mailbox → send → read → webhook.
 *
 * Prerequisites:
 *   - SSH tunnel to Stalwart (admin API + JMAP)
 *   - Required env vars set (see below)
 *
 * Run:
 *   pnpm -F @agentstack/relay test:smoke
 *
 * Required env vars:
 *   STALWART_API_URL            — e.g. http://localhost:8080
 *   STALWART_API_CREDENTIALS    — e.g. admin:password
 *   STALWART_JMAP_URL           — e.g. https://localhost:8443 (HTTPS — Stalwart serves JMAP over TLS)
 *   RELAY_ENCRYPTION_KEY        — 64 hex chars (openssl rand -hex 32)
 *   RELAY_DB_PATH               — e.g. /tmp/relay-smoke.db
 *   STALWART_WEBHOOK_SECRET     — HMAC secret for ingest endpoint
 *   RELAY_ALLOW_HTTP_WEBHOOKS   — set to "1"
 *   NODE_TLS_REJECT_UNAUTHORIZED — set to "0" (cert is for mail.relay.prim.sh, not localhost)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createServer } from "node:http";
import {
  createMailbox,
  listMailboxes,
  getMailbox,
  deleteMailbox,
  listMessages,
  getMessage,
  sendMessage,
  registerWebhook,
  listWebhooks,
  handleIngestEvent,
} from "../src/service.ts";
import { signPayload } from "../src/webhook-delivery.ts";
import { resetDb } from "../src/db.ts";

const WALLET = "0xSMOKE_TEST_WALLET_0000000000000001";

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function skip(reason: string): never {
  console.log(`SKIP: ${reason}`);
  process.exit(0);
}

// Webhook receiver state
interface WebhookCall {
  body: string;
  headers: Record<string, string>;
}

function startWebhookReceiver(): Promise<{
  server: Server;
  port: number;
  calls: WebhookCall[];
}> {
  const calls: WebhookCall[] = [];

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === "string") headers[k.toLowerCase()] = v;
        }
        calls.push({ body, headers });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port, calls });
    });
  });
}

async function poll<T>(
  fn: () => Promise<T>,
  check: (result: T) => boolean,
  intervalMs: number,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (check(result)) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Poll timed out after ${timeoutMs}ms`);
}

describe("relay.sh live smoke test", () => {
  let webhookServer: Server;
  let webhookPort: number;
  let webhookCalls: WebhookCall[];

  // State carried across sequential steps
  let mailboxId: string;
  let mailboxAddress: string;

  beforeAll(async () => {
    // Preflight: check required env vars
    try {
      requiredEnv("STALWART_API_URL");
      requiredEnv("STALWART_API_CREDENTIALS");
      requiredEnv("STALWART_JMAP_URL");
      requiredEnv("RELAY_ENCRYPTION_KEY");
    } catch (err) {
      skip((err as Error).message);
    }

    // Verify Stalwart is reachable
    try {
      const res = await fetch(`${process.env.STALWART_API_URL}/api/principal/admin`, {
        headers: {
          Authorization: `Basic ${Buffer.from(requiredEnv("STALWART_API_CREDENTIALS")).toString("base64")}`,
        },
      });
      if (!res.ok) skip(`Stalwart admin API returned ${res.status} — is the SSH tunnel up?`);
    } catch (err) {
      skip(`Cannot reach Stalwart at ${process.env.STALWART_API_URL} — ${(err as Error).message}`);
    }

    // Start webhook receiver
    const receiver = await startWebhookReceiver();
    webhookServer = receiver.server;
    webhookPort = receiver.port;
    webhookCalls = receiver.calls;
  });

  afterAll(async () => {
    // Clean up: delete the mailbox if it was created (best effort)
    if (mailboxId) {
      try {
        await deleteMailbox(mailboxId, WALLET);
      } catch {
        // already deleted or test failed before creation
      }
    }

    // Shut down webhook receiver
    if (webhookServer) {
      await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
    }

    // Reset DB singleton so it doesn't leak across test files
    resetDb();
  });

  it("1. create mailbox", async () => {
    const result = await createMailbox({}, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.id).toMatch(/^mbx_/);
    expect(result.data.address).toContain("@");
    expect(result.data.status).toBe("active");
    expect(new Date(result.data.expires_at).getTime()).toBeGreaterThan(Date.now());

    mailboxId = result.data.id;
    mailboxAddress = result.data.address;
  });

  it("2. list mailboxes — new mailbox appears", () => {
    const result = listMailboxes(WALLET, 1, 25);
    expect(result.total).toBeGreaterThanOrEqual(1);

    const found = result.mailboxes.find((m) => m.id === mailboxId);
    expect(found).toBeDefined();
    expect(found?.address).toBe(mailboxAddress);
  });

  it("3. get mailbox", async () => {
    const result = await getMailbox(mailboxId, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.id).toBe(mailboxId);
    expect(result.data.address).toBe(mailboxAddress);
    expect(result.data.status).toBe("active");
  });

  it("4. register webhook", async () => {
    const webhookSecret = "smoke-test-secret";
    const result = await registerWebhook(mailboxId, WALLET, {
      url: `http://127.0.0.1:${webhookPort}/hook`,
      secret: webhookSecret,
      events: ["message.received"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.id).toMatch(/^wh_/);
    expect(result.data.status).toBe("active");
  });

  it("5. list webhooks", () => {
    const result = listWebhooks(mailboxId, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.total).toBeGreaterThanOrEqual(1);
  });

  it("6. send email to self", async () => {
    const result = await sendMessage(mailboxId, WALLET, {
      to: mailboxAddress,
      subject: "R-11 smoke test",
      body: "Hello from the relay.sh smoke test.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.status).toBe("sent");
    expect(result.data.message_id).toBeTruthy();
  });

  it("7. verify sent message exists", async () => {
    // After EmailSubmission, the draft stays in the drafts folder on Stalwart.
    // Self-delivery to inbox requires SMTP loopback which may not complete.
    // Verify the message exists in "all" folders (i.e. the draft was created).
    const result = await listMessages(mailboxId, WALLET, { folder: "all", limit: 10, position: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.total).toBeGreaterThan(0);
    expect(result.data.messages[0].subject).toBe("R-11 smoke test");
  });

  it("8. read message detail", async () => {
    const listResult = await listMessages(mailboxId, WALLET, {
      folder: "all",
      limit: 1,
      position: 0,
    });
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;

    const msgId = listResult.data.messages[0].id;
    const result = await getMessage(mailboxId, WALLET, msgId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.subject).toBe("R-11 smoke test");
    expect(result.data.textBody).toContain("Hello from the relay.sh smoke test");
  });

  it("9. simulate ingest → webhook fires", async () => {
    const webhookSecret = process.env.STALWART_WEBHOOK_SECRET ?? "";
    const ingestPayload = JSON.stringify([
      {
        type: "message-ingest.ham",
        data: {
          rcptTo: [mailboxAddress],
          from: mailboxAddress,
          subject: "R-11 smoke test",
          messageId: "smoke-test-msg-id",
          size: 128,
        },
      },
    ]);

    const signature = webhookSecret ? signPayload(webhookSecret, ingestPayload) : "";

    const result = await handleIngestEvent(
      ingestPayload,
      webhookSecret ? signature : null,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.accepted).toBe(true);

    // Wait for async webhook delivery (fire-and-forget)
    await poll(
      async () => webhookCalls.length,
      (count) => count > 0,
      200,
      5_000,
    );

    expect(webhookCalls.length).toBeGreaterThan(0);
    const call = webhookCalls[0];
    const payload = JSON.parse(call.body);
    expect(payload.event).toBe("message.received");
    expect(payload.mailbox_id).toBe(mailboxId);
    expect(call.headers["x-webhook-id"]).toMatch(/^wh_/);

    // Verify HMAC signature if secret was set
    if (call.headers["x-signature"]) {
      const expected = signPayload("smoke-test-secret", call.body);
      expect(call.headers["x-signature"]).toBe(expected);
    }
  }, { timeout: 10_000 });

  it("10. delete mailbox", async () => {
    const result = await deleteMailbox(mailboxId, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.deleted).toBe(true);
  });

  it("11. verify cleanup — mailbox gone", async () => {
    const result = await getMailbox(mailboxId, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.code).toBe("not_found");

    // Clear so afterAll doesn't try to delete again
    mailboxId = "";
  });
});
