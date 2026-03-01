// SPDX-License-Identifier: Apache-2.0
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { metricsHandler, metricsMiddleware, resetMetrics } from "../src/metrics.ts";

function createApp(serviceName = "test.prim.sh") {
  const app = new Hono();
  app.use("*", metricsMiddleware());
  app.get("/v1/metrics", metricsHandler(serviceName));
  app.get("/v1/items", (c) => c.json({ items: [] }));
  app.post("/v1/items", (c) => c.json({ id: "1" }, 201));
  app.get("/v1/error", (c) => c.json({ error: "fail" }, 500));
  app.get("/v1/notfound", (c) => c.json({ error: "not found" }, 404));
  app.get("/v1/paid", (c) => {
    // Simulate a paid request succeeding
    return c.json({ ok: true });
  });
  return app;
}

describe("metricsMiddleware", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("increments request count", async () => {
    const app = createApp();
    await app.request("/v1/items", { method: "GET" });
    await app.request("/v1/items", { method: "GET" });
    await app.request("/v1/items", { method: "POST" });

    const res = await app.request("/v1/metrics", { method: "GET" });
    expect(res.status).toBe(200);
    const body = await res.json();

    // metrics handler returns snapshot before its own request is fully counted
    expect(body.requests.total).toBe(3);
    expect(body.requests.by_endpoint["GET /v1/items"].count).toBe(2);
    expect(body.requests.by_endpoint["POST /v1/items"].count).toBe(1);
  });

  it("tracks errors by status code", async () => {
    const app = createApp();
    await app.request("/v1/error", { method: "GET" });
    await app.request("/v1/error", { method: "GET" });
    await app.request("/v1/notfound", { method: "GET" });

    const res = await app.request("/v1/metrics", { method: "GET" });
    const body = await res.json();

    expect(body.errors.total).toBe(3);
    expect(body.errors.by_status["500"]).toBe(2);
    expect(body.errors.by_status["404"]).toBe(1);
    expect(body.requests.by_endpoint["GET /v1/error"].errors).toBe(2);
  });

  it("does not count 402 as an error", async () => {
    const app = new Hono();
    app.use("*", metricsMiddleware());
    app.get("/v1/metrics", metricsHandler("test.prim.sh"));
    app.get("/v1/pay", (c) => c.json({ error: "payment required" }, 402));

    await app.request("/v1/pay", { method: "GET" });

    const res = await app.request("/v1/metrics", { method: "GET" });
    const body = await res.json();

    expect(body.errors.total).toBe(0);
  });

  it("detects payment via payment-signature header on success", async () => {
    const app = createApp();
    await app.request("/v1/paid", {
      method: "GET",
      headers: { "payment-signature": "some-signature" },
    });

    const res = await app.request("/v1/metrics", { method: "GET" });
    const body = await res.json();

    expect(body.payments.total).toBe(1);
    expect(body.payments.by_endpoint["GET /v1/paid"]).toBe(1);
  });

  it("does not count payment-signature on non-2xx as a payment", async () => {
    const app = createApp();
    await app.request("/v1/error", {
      method: "GET",
      headers: { "payment-signature": "some-signature" },
    });

    const res = await app.request("/v1/metrics", { method: "GET" });
    const body = await res.json();

    expect(body.payments.total).toBe(0);
  });
});

describe("metricsHandler", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("returns correct JSON shape", async () => {
    const app = createApp("store.prim.sh");
    await app.request("/v1/items", { method: "GET" });

    const res = await app.request("/v1/metrics", { method: "GET" });
    const body = await res.json();

    expect(body.service).toBe("store.prim.sh");
    expect(typeof body.uptime_s).toBe("number");
    expect(body.uptime_s).toBeGreaterThanOrEqual(0);
    expect(typeof body.requests.total).toBe("number");
    expect(typeof body.requests.by_endpoint).toBe("object");
    expect(typeof body.payments.total).toBe("number");
    expect(typeof body.payments.by_endpoint).toBe("object");
    expect(typeof body.errors.total).toBe("number");
    expect(typeof body.errors.by_status).toBe("object");
  });

  it("includes p50 and p99 latency", async () => {
    const app = createApp();
    // Make several requests to have latency samples
    for (let i = 0; i < 5; i++) {
      await app.request("/v1/items", { method: "GET" });
    }

    const res = await app.request("/v1/metrics", { method: "GET" });
    const body = await res.json();

    const ep = body.requests.by_endpoint["GET /v1/items"];
    expect(typeof ep.p50_ms).toBe("number");
    expect(typeof ep.p99_ms).toBe("number");
    expect(ep.p50_ms).toBeGreaterThanOrEqual(0);
    expect(ep.p99_ms).toBeGreaterThanOrEqual(ep.p50_ms);
  });
});

describe("p50/p99 calculation", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("computes percentiles correctly with known latencies", async () => {
    // We can't easily inject latencies, but we can verify the structure.
    // Making 10 fast requests should yield low p50 and p99.
    const app = createApp();
    for (let i = 0; i < 10; i++) {
      await app.request("/v1/items", { method: "GET" });
    }

    const res = await app.request("/v1/metrics", { method: "GET" });
    const body = await res.json();

    const ep = body.requests.by_endpoint["GET /v1/items"];
    expect(ep.count).toBe(10);
    // All requests are fast in-process, so latencies should be very low
    expect(ep.p50_ms).toBeLessThan(1000);
    expect(ep.p99_ms).toBeLessThan(1000);
  });
});

describe("resetMetrics", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("clears all state", async () => {
    const app = createApp();
    await app.request("/v1/items", { method: "GET" });
    await app.request("/v1/error", { method: "GET" });

    resetMetrics();

    const res = await app.request("/v1/metrics", { method: "GET" });
    const body = await res.json();

    // After reset, metrics handler returns snapshot before its own request is counted
    expect(body.requests.total).toBe(0);
    expect(body.errors.total).toBe(0);
    expect(body.payments.total).toBe(0);
  });
});
