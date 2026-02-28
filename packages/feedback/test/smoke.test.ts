import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532";
  process.env.PRIM_INTERNAL_KEY = "test-internal-key";
});

// Stub bun:sqlite so db.ts doesn't fail in vitest (Node runtime)
vi.mock("bun:sqlite", () => {
  const rows: Map<string, Record<string, unknown>> = new Map();
  class MockDatabase {
    run() {}
    query(sql: string) {
      return {
        get: (..._args: unknown[]) => {
          if (sql.includes("COUNT")) {
            return { count: rows.size };
          }
          return null;
        },
        all: (..._args: unknown[]) => {
          return Array.from(rows.values());
        },
        run: (...args: unknown[]) => {
          if (sql.includes("INSERT")) {
            const params = args.flat();
            rows.set(params[0] as string, {
              id: params[0],
              primitive: params[1],
              endpoint: params[2],
              type: params[3],
              body: params[4],
              wallet: params[5],
              request_id: params[6],
              created_at: params[7],
            });
          }
        },
      };
    }
    close() {}
  }
  return { Database: MockDatabase };
});

import app from "../src/index.ts";

describe("feedback.sh app", () => {
  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'feedback.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "feedback.sh", status: "ok" });
  });

  // Check 3: skipped — free service (no x402 middleware)

  // Check 4: POST /v1/submit with valid body returns 200
  it("POST /v1/submit with valid body returns 200 { id, status: 'received' }", async () => {
    const res = await app.request("/v1/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primitive: "wallet.sh",
        type: "bug",
        body: "Transfer failed silently",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ id: expect.any(String), status: "received" });
  });

  // Check 5: POST /v1/submit with missing fields returns 400
  it("POST /v1/submit with missing fields returns 400", async () => {
    const res = await app.request("/v1/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Additional: POST /v1/submit with invalid type returns 400
  it("POST /v1/submit with invalid type returns 400", async () => {
    const res = await app.request("/v1/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primitive: "wallet.sh",
        type: "complaint",
        body: "Something broke",
      }),
    });
    expect(res.status).toBe(400);
  });

  // Additional: GET /v1/feed without x-internal-key returns 401
  it("GET /v1/feed without x-internal-key returns 401", async () => {
    const res = await app.request("/v1/feed");
    expect(res.status).toBe(401);
  });

  // Additional: GET /v1/feed with correct key returns 200
  it("GET /v1/feed with correct x-internal-key returns 200", async () => {
    const res = await app.request("/v1/feed", {
      headers: { "x-internal-key": "test-internal-key" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ items: expect.any(Array), total: expect.any(Number) });
  });
});
