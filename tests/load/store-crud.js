/**
 * k6 load test: store.sh CRUD lifecycle (create bucket → put object → get object → delete).
 *
 * Because every store endpoint requires x402 payment (a signed USDC header), this
 * script tests the layer the server can actually measure: how it handles the initial
 * 402 challenge. All paid endpoints should return 402 consistently under load.
 *
 * Two scenarios run in parallel:
 *   1. health  — free GET / endpoint (baseline, same as health.js but store-only)
 *   2. paid    — simulate CRUD requests; verify 402 is returned consistently and fast
 *
 * Usage:
 *   k6 run tests/load/store-crud.js
 *   k6 run --env STORE_URL=https://store.prim.sh tests/load/store-crud.js
 *   # Run against localhost directly (bypasses Caddy TLS):
 *   k6 run --env STORE_URL=http://localhost:3002 tests/load/store-crud.js
 *
 * Stages (both scenarios share):
 *   0→20 VUs over 30s, 20 VUs for 2m, 20→0 over 15s
 *
 * Pass criteria:
 *   - health p95 < 300ms (local Bun handler, no upstream)
 *   - paid p95 < 500ms (402 challenge generation is cheap)
 *   - error rate < 1% (5xx counts as error; 402 does NOT)
 *   - 402 check rate > 99% on paid endpoints
 */

import { check, group, sleep } from "k6";
import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.STORE_URL ?? "https://store.prim.sh";

// Custom metrics
const healthErrors = new Rate("store_health_errors");
const paidErrors = new Rate("store_paid_errors"); // 5xx only
const challengeRate = new Rate("store_402_rate"); // should be ~100%
const healthLatency = new Trend("store_health_ms", true);
const paidLatency = new Trend("store_paid_ms", true);
const requestCount = new Counter("store_requests_total");

export const options = {
  scenarios: {
    health: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "120s", target: 10 },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
      exec: "healthScenario",
    },
    paid: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "120s", target: 10 },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
      exec: "paidScenario",
    },
  },
  thresholds: {
    // Health endpoint: tight budget (pure Bun handler, no upstream)
    store_health_ms: ["p(95)<300"],
    store_health_errors: ["rate<0.01"],

    // Paid endpoints: 402 must be fast and consistent
    store_paid_ms: ["p(95)<500"],
    store_paid_errors: ["rate<0.01"], // 5xx errors only
    store_402_rate: ["rate>0.99"], // 402 must be returned > 99% of time

    // Global
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

// ─── Health scenario ──────────────────────────────────────────────────────────

export function healthScenario() {
  group("store.sh health", () => {
    const res = http.get(`${BASE_URL}/`, { timeout: "10s" });

    healthErrors.add(res.status !== 200);
    healthLatency.add(res.timings.duration);
    requestCount.add(1, { endpoint: "GET /" });

    check(res, {
      "GET / → 200": (r) => r.status === 200,
      "GET / → has service field": (r) => {
        try {
          return JSON.parse(r.body).service === "store.sh";
        } catch {
          return false;
        }
      },
      "GET / → status ok": (r) => {
        try {
          return JSON.parse(r.body).status === "ok";
        } catch {
          return false;
        }
      },
      "GET / → < 300ms": (r) => r.timings.duration < 300,
    });
  });

  sleep(1 + Math.random() * 0.5);
}

// ─── Paid scenario ────────────────────────────────────────────────────────────
//
// Every paid endpoint returns 402 with a payment challenge (x402 protocol).
// We verify the 402 is returned consistently and quickly — this is the primary
// load characteristic we care about before any agent wallets pay through.

const PAID_ENDPOINTS = [
  // Bucket CRUD
  {
    method: "POST",
    path: "/v1/buckets",
    body: JSON.stringify({ name: "load-test-bucket" }),
    label: "POST /v1/buckets",
  },
  { method: "GET", path: "/v1/buckets", body: null, label: "GET /v1/buckets" },
  { method: "GET", path: "/v1/buckets/test-bucket-id", body: null, label: "GET /v1/buckets/:id" },
  {
    method: "DELETE",
    path: "/v1/buckets/test-bucket-id",
    body: null,
    label: "DELETE /v1/buckets/:id",
  },
  // Object CRUD
  {
    method: "PUT",
    path: "/v1/buckets/test-bucket-id/objects/test-key.txt",
    body: "hello load test",
    label: "PUT /v1/buckets/:id/objects/*",
  },
  {
    method: "GET",
    path: "/v1/buckets/test-bucket-id/objects",
    body: null,
    label: "GET /v1/buckets/:id/objects",
  },
  {
    method: "GET",
    path: "/v1/buckets/test-bucket-id/objects/test-key.txt",
    body: null,
    label: "GET /v1/buckets/:id/objects/*",
  },
  {
    method: "DELETE",
    path: "/v1/buckets/test-bucket-id/objects/test-key.txt",
    body: null,
    label: "DELETE /v1/buckets/:id/objects/*",
  },
  // Quota
  {
    method: "GET",
    path: "/v1/buckets/test-bucket-id/quota",
    body: null,
    label: "GET /v1/buckets/:id/quota",
  },
];

export function paidScenario() {
  // Pick one endpoint per iteration (round-robin across endpoints by VU)
  const ep = PAID_ENDPOINTS[__ITER % PAID_ENDPOINTS.length];

  const headers = { "Content-Type": "application/json" };
  const params = { headers, timeout: "10s" };
  const url = `${BASE_URL}${ep.path}`;

  let res;
  group("store.sh paid", () => {
    if (ep.method === "POST" || ep.method === "PUT") {
      res = http.request(ep.method, url, ep.body, params);
    } else if (ep.method === "DELETE") {
      res = http.del(url, null, params);
    } else {
      res = http.get(url, params);
    }

    requestCount.add(1, { endpoint: ep.label });

    // 5xx is an error; 402 is expected and correct
    const is5xx = res.status >= 500;
    paidErrors.add(is5xx);

    // 402 must be the response on all paid endpoints (no wallet header provided)
    const is402 = res.status === 402;
    challengeRate.add(is402);

    paidLatency.add(res.timings.duration, { endpoint: ep.label });

    check(res, {
      [`${ep.label} → 402 or non-5xx`]: (r) => r.status < 500,
      [`${ep.label} → 402 challenge`]: (r) => r.status === 402,
      [`${ep.label} → < 500ms`]: (r) => r.timings.duration < 500,
    });

    if (is5xx) {
      console.error(
        `[store.sh] 5xx on ${ep.label}: status=${res.status} body=${res.body.slice(0, 200)}`,
      );
    }
  });

  sleep(0.5 + Math.random() * 0.5);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = buildSummary(data);
  return {
    stdout: summary,
    "tests/load/results/store-crud-latest.json": JSON.stringify(data, null, 2),
  };
}

function buildSummary(data) {
  const m = data.metrics;
  const lines = [
    "",
    "=== store.sh CRUD Load Test — Summary ===",
    "",
    `Total requests:         ${m.store_requests_total?.values?.count ?? "n/a"}`,
    `Health p95:             ${(m.store_health_ms?.values?.["p(95)"] ?? 0).toFixed(0)}ms`,
    `Paid (402) p95:         ${(m.store_paid_ms?.values?.["p(95)"] ?? 0).toFixed(0)}ms`,
    `Health errors:          ${((m.store_health_errors?.values?.rate ?? 0) * 100).toFixed(2)}%`,
    `Paid 5xx errors:        ${((m.store_paid_errors?.values?.rate ?? 0) * 100).toFixed(2)}%`,
    `402 challenge rate:     ${((m.store_402_rate?.values?.rate ?? 0) * 100).toFixed(2)}%  (target >99%)`,
    "",
    "Thresholds:",
  ];

  for (const [name, threshold] of Object.entries(data.thresholds ?? {})) {
    const passed = threshold.ok ? "PASS" : "FAIL";
    lines.push(`  ${passed}  ${name}`);
  }

  lines.push("");
  return lines.join("\n");
}
