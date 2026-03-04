// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  createAccessLogMiddleware,
  getAccessLogDb,
  queryAccessLog,
  resetAccessLogDbs,
} from "../src/access-log.ts";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "prim-access-log-test-"));
  vi.stubEnv("PRIM_DATA_DIR", tempDir);
  resetAccessLogDbs();
});

afterEach(() => {
  resetAccessLogDbs();
  rmSync(tempDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("access log middleware", () => {
  it("logs all requests with status and duration", async () => {
    const app = new Hono();
    app.use("*", createAccessLogMiddleware("test.sh"));
    app.get("/", (c) => c.json({ ok: true }));
    app.post("/v1/action", (c) => c.json({ done: true }));

    await app.request("/", { method: "GET" });
    await app.request("/v1/action", { method: "POST" });

    const db = getAccessLogDb("test.sh");
    const entries = queryAccessLog(db);

    expect(entries).toHaveLength(2);
    // Most recent first
    expect(entries[0].method).toBe("POST");
    expect(entries[0].path).toBe("/v1/action");
    expect(entries[0].status).toBe(200);
    expect(entries[0].duration_ms).toBeGreaterThanOrEqual(0);
    expect(entries[0].created_at).toBeGreaterThan(0);

    expect(entries[1].method).toBe("GET");
    expect(entries[1].path).toBe("/");
    expect(entries[1].status).toBe(200);
  });

  it("captures wallet address when set by x402", async () => {
    const app = new Hono<{ Variables: { walletAddress: string | undefined } }>();
    app.use("*", createAccessLogMiddleware("test.sh"));
    // Simulate x402 setting wallet on paid routes
    app.post("/v1/paid", (c) => {
      c.set("walletAddress", "0xABCD1234");
      return c.json({ ok: true });
    });
    app.get("/", (c) => c.json({ ok: true }));

    await app.request("/v1/paid", { method: "POST" });
    await app.request("/", { method: "GET" });

    const db = getAccessLogDb("test.sh");
    const entries = queryAccessLog(db);

    // Paid route has wallet
    const paidEntry = entries.find((e) => e.path === "/v1/paid");
    expect(paidEntry?.wallet).toBe("0xABCD1234");

    // Free route has null wallet
    const freeEntry = entries.find((e) => e.path === "/");
    expect(freeEntry?.wallet).toBeNull();
  });

  it("captures request ID when set", async () => {
    const app = new Hono<{ Variables: { requestId: string } }>();
    app.use("*", async (c, next) => {
      c.set("requestId", "req-abc-123");
      await next();
    });
    app.use("*", createAccessLogMiddleware("test.sh"));
    app.get("/", (c) => c.json({ ok: true }));

    await app.request("/", { method: "GET" });

    const db = getAccessLogDb("test.sh");
    const entries = queryAccessLog(db);
    expect(entries[0].request_id).toBe("req-abc-123");
  });

  it("logs error status codes", async () => {
    const app = new Hono();
    app.use("*", createAccessLogMiddleware("test.sh"));
    app.post("/v1/fail", (c) => c.json({ error: "bad" }, 400));

    await app.request("/v1/fail", { method: "POST" });

    const db = getAccessLogDb("test.sh");
    const entries = queryAccessLog(db);
    expect(entries[0].status).toBe(400);
  });
});

describe("queryAccessLog filters", () => {
  it("filters by wallet", async () => {
    const app = new Hono<{ Variables: { walletAddress: string | undefined } }>();
    app.use("*", createAccessLogMiddleware("test.sh"));
    app.post("/v1/a", (c) => {
      c.set("walletAddress", "0xAAAA");
      return c.json({ ok: true });
    });
    app.post("/v1/b", (c) => {
      c.set("walletAddress", "0xBBBB");
      return c.json({ ok: true });
    });

    await app.request("/v1/a", { method: "POST" });
    await app.request("/v1/b", { method: "POST" });

    const db = getAccessLogDb("test.sh");
    const filtered = queryAccessLog(db, { wallet: "0xAAAA" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].wallet).toBe("0xAAAA");
  });

  it("filters by time range", async () => {
    const app = new Hono();
    app.use("*", createAccessLogMiddleware("test.sh"));
    app.get("/", (c) => c.json({ ok: true }));

    const before = Date.now();
    await app.request("/", { method: "GET" });
    const after = Date.now();

    const db = getAccessLogDb("test.sh");
    const found = queryAccessLog(db, { since: before, until: after });
    expect(found).toHaveLength(1);

    const notFound = queryAccessLog(db, { since: after + 1000 });
    expect(notFound).toHaveLength(0);
  });

  it("filters by method", async () => {
    const app = new Hono();
    app.use("*", createAccessLogMiddleware("test.sh"));
    app.get("/", (c) => c.json({ ok: true }));
    app.post("/", (c) => c.json({ ok: true }));

    await app.request("/", { method: "GET" });
    await app.request("/", { method: "POST" });

    const db = getAccessLogDb("test.sh");
    const gets = queryAccessLog(db, { method: "GET" });
    expect(gets).toHaveLength(1);
    expect(gets[0].method).toBe("GET");
  });

  it("respects limit", async () => {
    const app = new Hono();
    app.use("*", createAccessLogMiddleware("test.sh"));
    app.get("/", (c) => c.json({ ok: true }));

    for (let i = 0; i < 5; i++) {
      await app.request("/", { method: "GET" });
    }

    const db = getAccessLogDb("test.sh");
    const limited = queryAccessLog(db, { limit: 2 });
    expect(limited).toHaveLength(2);
  });
});
