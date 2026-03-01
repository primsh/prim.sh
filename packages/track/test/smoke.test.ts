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

// Mock the service so smoke tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    trackPackage: vi.fn(),
  };
});

import type { TrackResponse } from "../src/api.ts";
import app from "../src/index.ts";
import { trackPackage } from "../src/service.ts";

const MOCK_TRACK_RESPONSE: TrackResponse = {
  tracking_number: "1Z999AA10123456784",
  carrier: "ups",
  status: "in_transit",
  status_detail: "Package in transit",
  eta: "2026-03-01T12:00:00Z",
  events: [
    {
      status: "in_transit",
      status_detail: "Departed facility",
      datetime: "2026-02-26T08:00:00Z",
      location: { city: "Louisville", state: "KY", country: "US" },
    },
  ],
};

describe("track.sh app", () => {
  beforeEach(() => {
    vi.mocked(trackPackage).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'track.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "track.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({ "POST /v1/track": expect.any(String) }),
    );
  });

  // Check 4: happy path — handler returns 200 with mocked service response
  it("POST /v1/track with valid data returns 200 with tracking data", async () => {
    vi.mocked(trackPackage).mockResolvedValueOnce({ ok: true, data: MOCK_TRACK_RESPONSE });

    const res = await app.request("/v1/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracking_number: "1Z999AA10123456784", carrier: "ups" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as TrackResponse;
    expect(body.tracking_number).toBe("1Z999AA10123456784");
    expect(body.carrier).toBe("ups");
    expect(body.status).toBe("in_transit");
    expect(Array.isArray(body.events)).toBe(true);
  });

  // Check 5: 400 on missing tracking_number — service returns invalid_request → handler maps to 400
  it("POST /v1/track with missing tracking_number returns 400", async () => {
    vi.mocked(trackPackage).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "tracking_number is required",
    });

    const res = await app.request("/v1/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
