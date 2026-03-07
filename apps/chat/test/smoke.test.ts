// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.CHAT_ENCRYPTION_KEY = "a".repeat(64);
  process.env.CHAT_SESSION_SECRET = "test-secret-for-signing-sessions";
  process.env.CHAT_DB_PATH = ":memory:";
});

import app from "../src/index.ts";

describe("chat app", () => {
  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET /health returns health response
  it("GET /health returns { service: 'chat', status: 'ok' }", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "chat", status: "ok" });
  });

  // Check 3: auth routes exist
  it("POST /auth/register/options returns 200", async () => {
    const res = await app.request("/auth/register/options", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toBeDefined();
    expect(body.challenge_id).toBeDefined();
  });

  // Check 4: POST /auth/login/options returns 200
  it("POST /auth/login/options returns 200", async () => {
    const res = await app.request("/auth/login/options", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toBeDefined();
    expect(body.challenge_id).toBeDefined();
  });

  // Check 5: protected route without session returns 401
  it("GET /api/conversations without session returns 401", async () => {
    const res = await app.request("/api/conversations");
    expect(res.status).toBe(401);
  });

  // Check 6: POST /api/chat without session returns 401
  it("POST /api/chat without session returns 401", async () => {
    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    expect(res.status).toBe(401);
  });
});
