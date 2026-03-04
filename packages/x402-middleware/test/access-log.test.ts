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
  resolveRoutePrice,
} from "../src/access-log.ts";
import type { AgentStackRouteConfig } from "../src/types.ts";

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

  it("logs price_usdc from route config for paid requests", async () => {
    const routes: AgentStackRouteConfig = {
      "POST /v1/action": "0.005",
    };
    const app = new Hono<{ Variables: { walletAddress: string | undefined } }>();
    app.use("*", createAccessLogMiddleware("test.sh", { routes, network: "eip155:8453" }));
    app.post("/v1/action", (c) => {
      c.set("walletAddress", "0xWALLET");
      return c.json({ ok: true });
    });
    app.get("/", (c) => c.json({ ok: true }));

    await app.request("/v1/action", { method: "POST" });
    await app.request("/", { method: "GET" });

    const db = getAccessLogDb("test.sh");
    const entries = queryAccessLog(db);

    const paidEntry = entries.find((e) => e.path === "/v1/action");
    expect(paidEntry?.price_usdc).toBe("0.005");
    expect(paidEntry?.network).toBe("eip155:8453");

    // Free route has null price
    const freeEntry = entries.find((e) => e.path === "/");
    expect(freeEntry?.price_usdc).toBeNull();
  });

  it("price_usdc is null for 402 responses even with route config", async () => {
    const routes: AgentStackRouteConfig = {
      "POST /v1/action": "0.005",
    };
    const app = new Hono();
    app.use("*", createAccessLogMiddleware("test.sh", { routes, network: "eip155:8453" }));
    app.post("/v1/action", (c) => c.json({ error: "payment required" }, 402));

    await app.request("/v1/action", { method: "POST" });

    const db = getAccessLogDb("test.sh");
    const entries = queryAccessLog(db);
    expect(entries[0].price_usdc).toBeNull();
    expect(entries[0].network).toBe("eip155:8453");
  });

  it("network is populated from options", async () => {
    const app = new Hono();
    app.use("*", createAccessLogMiddleware("test.sh", { network: "eip155:84532" }));
    app.get("/", (c) => c.json({ ok: true }));

    await app.request("/", { method: "GET" });

    const db = getAccessLogDb("test.sh");
    const entries = queryAccessLog(db);
    expect(entries[0].network).toBe("eip155:84532");
  });
});

describe("schema migration", () => {
  it("adds price_usdc and network columns to existing DB without data loss", () => {
    // Import the mock Database (vitest aliases bun:sqlite → node:sqlite shim)
    const { Database } = require("../src/__mocks__/bun-sqlite.ts");
    const dbFile = join(tempDir, "old-access.db");
    const oldDb = new Database(dbFile, { create: true });
    oldDb.exec(`
      CREATE TABLE access_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        method      TEXT NOT NULL,
        path        TEXT NOT NULL,
        status      INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        wallet      TEXT,
        request_id  TEXT,
        created_at  INTEGER NOT NULL
      );
    `);
    oldDb.prepare(
      "INSERT INTO access_log (method, path, status, duration_ms, wallet, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("GET", "/", 200, 5, null, null, Date.now());
    oldDb.close();

    // Now open via getAccessLogDb which should migrate
    vi.stubEnv("PRIM_DATA_DIR", tempDir);
    resetAccessLogDbs();
    const db = getAccessLogDb("old");
    const entries = queryAccessLog(db);

    expect(entries).toHaveLength(1);
    expect(entries[0].method).toBe("GET");
    expect(entries[0].price_usdc).toBeNull();
    expect(entries[0].network).toBeNull();

    // Verify new columns are usable
    db.prepare(
      "INSERT INTO access_log (method, path, status, duration_ms, created_at, price_usdc, network) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("POST", "/v1/test", 200, 10, Date.now(), "0.001", "eip155:8453");

    const all = queryAccessLog(db);
    expect(all).toHaveLength(2);
    const newEntry = all.find((e) => e.path === "/v1/test");
    expect(newEntry?.price_usdc).toBe("0.001");
    expect(newEntry?.network).toBe("eip155:8453");
  });
});

describe("resolveRoutePrice", () => {
  it("resolves exact match", () => {
    const routes: AgentStackRouteConfig = {
      "POST /v1/buckets": "0.001",
      "GET /v1/buckets": { price: "0.002", description: "list" },
    };
    expect(resolveRoutePrice("POST /v1/buckets", routes)).toBe("0.001");
    expect(resolveRoutePrice("GET /v1/buckets", routes)).toBe("0.002");
  });

  it("resolves [param] patterns", () => {
    const routes: AgentStackRouteConfig = {
      "GET /v1/buckets/[id]": "0.001",
      "DELETE /v1/buckets/[id]/objects/[key]": "0.003",
    };
    expect(resolveRoutePrice("GET /v1/buckets/b_abc123", routes)).toBe("0.001");
    expect(resolveRoutePrice("DELETE /v1/buckets/b_1/objects/readme.txt", routes)).toBe("0.003");
  });

  it("resolves * wildcard patterns", () => {
    const routes: AgentStackRouteConfig = {
      "GET /v1/files/*": "0.001",
    };
    expect(resolveRoutePrice("GET /v1/files/path/to/file.txt", routes)).toBe("0.001");
  });

  it("returns null for unmatched routes", () => {
    const routes: AgentStackRouteConfig = {
      "POST /v1/action": "0.001",
    };
    expect(resolveRoutePrice("GET /v1/unknown", routes)).toBeNull();
    expect(resolveRoutePrice("GET /", routes)).toBeNull();
  });

  it("prefers exact match over pattern", () => {
    const routes: AgentStackRouteConfig = {
      "GET /v1/buckets/special": "0.010",
      "GET /v1/buckets/[id]": "0.001",
    };
    expect(resolveRoutePrice("GET /v1/buckets/special", routes)).toBe("0.010");
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

  it("filters by status", async () => {
    const app = new Hono();
    app.use("*", createAccessLogMiddleware("test.sh"));
    app.get("/ok", (c) => c.json({ ok: true }));
    app.get("/fail", (c) => c.json({ error: "not found" }, 404));

    await app.request("/ok", { method: "GET" });
    await app.request("/fail", { method: "GET" });

    const db = getAccessLogDb("test.sh");
    const ok = queryAccessLog(db, { status: 200 });
    expect(ok).toHaveLength(1);
    expect(ok[0].path).toBe("/ok");

    const notFound = queryAccessLog(db, { status: 404 });
    expect(notFound).toHaveLength(1);
    expect(notFound[0].path).toBe("/fail");
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
