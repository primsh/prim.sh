import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:8453";
  process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";
});

// Mock node:path so resolve() doesn't throw when import.meta.dir is undefined (Bun-only).
// Also mock node:fs so readFileSync for llms.txt returns a stub without hitting disk.
vi.mock("node:path", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:path")>();
  return {
    ...original,
    resolve: (...args: unknown[]) => {
      // When import.meta.dir is undefined, the first arg will be undefined — return a stub path
      if (args[0] === undefined) return "/stub/path";
      return (original.resolve as (...a: string[]) => string)(...(args as string[]));
    },
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    readFileSync: vi.fn((path: unknown, enc: unknown) => {
      if (typeof path === "string" && (path.includes("llms.txt") || path.startsWith("/stub/"))) {
        return "# llms.txt stub";
      }
      return (original.readFileSync as (...a: unknown[]) => unknown)(path, enc);
    }),
  };
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

// Mock service layer so smoke tests don't need real APIs / DB
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    createZone: vi.fn(),
    listZones: vi.fn(),
    getZone: vi.fn(),
    deleteZone: vi.fn(),
    createRecord: vi.fn(),
    listRecords: vi.fn(),
    getRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    searchDomains: vi.fn(),
    batchRecords: vi.fn(),
    mailSetup: vi.fn(),
    verifyZone: vi.fn(),
    quoteDomain: vi.fn(),
    registerDomain: vi.fn(),
    recoverRegistration: vi.fn(),
    configureNs: vi.fn(),
    getRegistrationStatus: vi.fn(),
    activateZone: vi.fn(),
  };
});

// Mock db.ts — getQuoteById is imported directly by index.ts for /v1/domains/register
vi.mock("../src/db.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/db.ts")>();
  return {
    ...original,
    getQuoteById: vi.fn(() => null),
  };
});

// Mock @x402/core/http — HTTPFacilitatorClient is instantiated at module load
vi.mock("@x402/core/http", () => ({
  HTTPFacilitatorClient: vi.fn().mockImplementation(() => ({
    settle: vi.fn(),
  })),
  encodePaymentRequiredHeader: vi.fn(() => "encoded"),
  decodePaymentSignatureHeader: vi.fn(() => ({})),
}));

import type { CreateZoneResponse } from "../src/api.ts";
import app from "../src/index.ts";
import { createZone } from "../src/service.ts";

const MOCK_ZONE_RESPONSE: CreateZoneResponse = {
  zone: {
    id: "z_abc1234",
    domain: "example.com",
    status: "pending",
    name_servers: ["ns1.cloudflare.com", "ns2.cloudflare.com"],
    owner_wallet: "0x0000000000000000000000000000000000000001",
    created_at: "2026-02-26T00:00:00.000Z",
  },
};

describe("domain.sh app", () => {
  beforeEach(() => {
    vi.mocked(createZone).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'domain.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "domain.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({ "POST /v1/zones": expect.any(String) }),
    );
  });

  // Check 4: happy path — POST /v1/zones returns 201 with zone data
  it("POST /v1/zones with valid data returns 201 with zone", async () => {
    vi.mocked(createZone).mockResolvedValueOnce({ ok: true, data: MOCK_ZONE_RESPONSE });

    const res = await app.request("/v1/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateZoneResponse;
    expect(body.zone).toBeDefined();
    expect(body.zone.domain).toBe("example.com");
    expect(body.zone.status).toBe("pending");
    expect(Array.isArray(body.zone.name_servers)).toBe(true);
  });

  // Check 5: 400 on invalid domain — service returns invalid_request → handler maps to 400
  it("POST /v1/zones with invalid domain returns 400", async () => {
    vi.mocked(createZone).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid domain format",
    });

    const res = await app.request("/v1/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "not-a-valid-domain" }),
    });

    expect(res.status).toBe(400);
  });
});
