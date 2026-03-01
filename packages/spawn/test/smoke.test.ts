// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:8453";
  process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";
});

import { mockX402Middleware } from "@primsh/x402-middleware/testing";

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

// Mock the service so smoke tests don't need a real API key or DB
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

import type { CreateServerResponse } from "../src/api.ts";
import app from "../src/index.ts";
import { createServer } from "../src/service.ts";

const MOCK_ACTION = {
  id: "act_abc123",
  command: "create",
  status: "running",
  started_at: "2026-02-26T00:00:00Z",
  finished_at: null,
};

const MOCK_SERVER = {
  id: "srv_abc123",
  provider: "digitalocean",
  provider_id: "12345678",
  name: "test-server",
  type: "small",
  status: "initializing" as const,
  image: "ubuntu-24.04",
  location: "nyc3",
  public_net: { ipv4: { ip: "1.2.3.4" }, ipv6: null },
  owner_wallet: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  created_at: "2026-02-26T00:00:00Z",
};

const MOCK_CREATE_RESPONSE: CreateServerResponse = {
  server: MOCK_SERVER,
  action: MOCK_ACTION,
  deposit_charged: "0.01",
  deposit_remaining: "0.00",
};

describe("spawn.sh app", () => {
  beforeEach(() => {
    vi.mocked(createServer).mockReset();
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
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({ "POST /v1/servers": expect.any(String) }),
    );
  });

  // Check 4: happy path — handler returns 201 with mocked service response
  it("POST /v1/servers with valid data returns 201 with server data", async () => {
    vi.mocked(createServer).mockResolvedValueOnce({ ok: true, data: MOCK_CREATE_RESPONSE });

    const res = await app.request("/v1/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test-server",
        type: "small",
        image: "ubuntu-24.04",
        location: "nyc3",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateServerResponse;
    expect(body.server.id).toBe("srv_abc123");
    expect(body.server.status).toBe("initializing");
    expect(body.deposit_charged).toBe("0.01");
    expect(body.action.command).toBe("create");
  });

  // Check 5: 400 on invalid input — service returns invalid_request → handler maps to 400
  it("POST /v1/servers with invalid input returns 400", async () => {
    vi.mocked(createServer).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Server name must contain only alphanumeric characters and hyphens",
    });

    const res = await app.request("/v1/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "invalid name!",
        type: "small",
        image: "ubuntu-24.04",
        location: "nyc3",
      }),
    });
    expect(res.status).toBe(400);
  });
});
