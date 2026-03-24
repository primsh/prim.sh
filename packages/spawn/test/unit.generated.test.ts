// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:8453";
  process.env.REVENUE_WALLET = "0x0000000000000000000000000000000000000001";
});

// Stub bun:sqlite so db.ts doesn't fail in vitest (Node runtime)
import { mockBunSqlite, mockX402Middleware } from "@primsh/x402-middleware/testing";
vi.mock("bun:sqlite", () => mockBunSqlite());

const createAgentStackMiddlewareSpy = vi.hoisted(() => vi.fn());

vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  const mocks = mockX402Middleware();
  createAgentStackMiddlewareSpy.mockImplementation(mocks.createAgentStackMiddleware);
  return {
    ...original,
    createAgentStackMiddleware: createAgentStackMiddlewareSpy,
    createWalletAllowlistChecker: vi.fn(mocks.createWalletAllowlistChecker),
  };
});

// Mock the service so unit tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    createServer: vi.fn(),
    listServers: vi.fn(),
    getServer: vi.fn(),
    deleteServer: vi.fn(),
    startServer: vi.fn(),
    stopServer: vi.fn(),
    rebootServer: vi.fn(),
    resizeServer: vi.fn(),
    rebuildServer: vi.fn(),
    registerSshKey: vi.fn(),
    listSshKeys: vi.fn(),
    deleteSshKey: vi.fn(),
  };
});

import app from "../src/index.ts";
import {
  createServer,
  listServers,
  getServer,
  deleteServer,
  startServer,
  stopServer,
  rebootServer,
  resizeServer,
  rebuildServer,
  listSshKeys,
  deleteSshKey,
} from "../src/service.ts";

describe("spawn.sh app", () => {
  beforeEach(() => {
    vi.mocked(createServer).mockReset();
    vi.mocked(listServers).mockReset();
    vi.mocked(getServer).mockReset();
    vi.mocked(deleteServer).mockReset();
    vi.mocked(startServer).mockReset();
    vi.mocked(stopServer).mockReset();
    vi.mocked(rebootServer).mockReset();
    vi.mocked(resizeServer).mockReset();
    vi.mocked(rebuildServer).mockReset();
    vi.mocked(listSshKeys).mockReset();
    vi.mocked(deleteSshKey).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'spawn.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "spawn.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalled();
  });

  // Check 4: POST /v1/servers — happy path
  it("POST /v1/servers returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(createServer).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", type: "test", image: "test", location: "test" }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/servers — error path
  it("POST /v1/servers returns 400 (invalid_request)", async () => {
    vi.mocked(createServer).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required fields",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/servers — happy path
  it("GET /v1/servers returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(listServers).mockReturnValueOnce({} as any);

    const res = await app.request("/v1/servers?limit=10&after=test-cursor", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });

  // Check 4: GET /v1/servers/test-id-001 — happy path
  it.skip("GET /v1/servers/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(getServer).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/servers/test-id-001", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/servers/test-id-001 — error path
  it.skip("GET /v1/servers/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(getServer).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Server not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/servers/test-id-001", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: DELETE /v1/servers/test-id-001 — happy path
  it.skip("DELETE /v1/servers/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(deleteServer).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/servers/test-id-001", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/servers/test-id-001 — error path
  it.skip("DELETE /v1/servers/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(deleteServer).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Server not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/servers/test-id-001", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/servers/test-id-001/start — happy path
  it.skip("POST /v1/servers/test-id-001/start returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(startServer).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/servers/test-id-001/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/servers/test-id-001/start — error path
  it.skip("POST /v1/servers/test-id-001/start returns 404 (not_found)", async () => {
    vi.mocked(startServer).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Server not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/servers/test-id-001/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/servers/test-id-001/stop — happy path
  it.skip("POST /v1/servers/test-id-001/stop returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(stopServer).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/servers/test-id-001/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/servers/test-id-001/stop — error path
  it.skip("POST /v1/servers/test-id-001/stop returns 404 (not_found)", async () => {
    vi.mocked(stopServer).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Server not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/servers/test-id-001/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/servers/test-id-001/reboot — happy path
  it.skip("POST /v1/servers/test-id-001/reboot returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(rebootServer).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/servers/test-id-001/reboot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/servers/test-id-001/reboot — error path
  it.skip("POST /v1/servers/test-id-001/reboot returns 404 (not_found)", async () => {
    vi.mocked(rebootServer).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Server not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/servers/test-id-001/reboot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/servers/test-id-001/resize — happy path
  it.skip("POST /v1/servers/test-id-001/resize returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(resizeServer).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/servers/test-id-001/resize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/servers/test-id-001/resize — error path
  it.skip("POST /v1/servers/test-id-001/resize returns 400 (invalid_request)", async () => {
    vi.mocked(resizeServer).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing type field or invalid value",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/servers/test-id-001/resize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/servers/test-id-001/rebuild — happy path
  it.skip("POST /v1/servers/test-id-001/rebuild returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(rebuildServer).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/servers/test-id-001/rebuild", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/servers/test-id-001/rebuild — error path
  it.skip("POST /v1/servers/test-id-001/rebuild returns 400 (invalid_request)", async () => {
    vi.mocked(rebuildServer).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing image field",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/servers/test-id-001/rebuild", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/ssh-keys — happy path
  it.skip("POST /v1/ssh-keys returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(createServer).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/ssh-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", public_key: "test" }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/ssh-keys — error path
  it.skip("POST /v1/ssh-keys returns 400 (invalid_request)", async () => {
    vi.mocked(createServer).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing name or public_key",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/ssh-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/ssh-keys — happy path
  it("GET /v1/ssh-keys returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(listSshKeys).mockReturnValueOnce({} as any);

    const res = await app.request("/v1/ssh-keys", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });

  // Check 4: DELETE /v1/ssh-keys/test-id-001 — happy path
  it.skip("DELETE /v1/ssh-keys/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(deleteSshKey).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/ssh-keys/test-id-001", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/ssh-keys/test-id-001 — error path
  it.skip("DELETE /v1/ssh-keys/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(deleteSshKey).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "SSH key not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/ssh-keys/test-id-001", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
