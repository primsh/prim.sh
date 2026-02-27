/**
 * k6 load test: health endpoint sweep for all deployed prim.sh primitives.
 *
 * Targets the public HTTPS endpoints (via Caddy reverse proxy on VPS).
 * All health endpoints are free (no x402 payment required).
 *
 * Usage:
 *   k6 run tests/load/health.js
 *   k6 run --env BASE_URL=https://wallet.prim.sh tests/load/health.js  # override for single service
 *
 * Stages:
 *   0→10 VUs over 30s (ramp up)
 *   10 VUs for 1m (sustained)
 *   10→0 VUs over 15s (ramp down)
 *
 * Pass criteria (see thresholds section):
 *   - p95 response time < 500ms
 *   - error rate < 1%
 *   - all checks pass > 99%
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Custom metrics per service
const errorRate = new Rate("prim_health_errors");
const serviceTrend = new Trend("prim_health_response_ms", true);

export const options = {
  stages: [
    { duration: "30s", target: 10 }, // ramp up
    { duration: "60s", target: 10 }, // sustained
    { duration: "15s", target: 0 },  // ramp down
  ],
  thresholds: {
    // Global: p95 < 500ms, error rate < 1%
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    prim_health_errors: ["rate<0.01"],
    prim_health_response_ms: ["p(95)<500"],
  },
};

// Service registry: name → public HTTPS URL
const SERVICES = [
  { name: "wallet.sh",  url: "https://wallet.prim.sh/",  port: 3001 },
  { name: "faucet.sh",  url: "https://faucet.prim.sh/",  port: 3003 },
  { name: "spawn.sh",   url: "https://spawn.prim.sh/",   port: 3004 },
  { name: "store.sh",   url: "https://store.prim.sh/",   port: 3002 },
  { name: "email.sh",   url: "https://email.prim.sh/",   port: 3006 },
  { name: "search.sh",  url: "https://search.prim.sh/",  port: 3005 },
  { name: "token.sh",   url: "https://token.prim.sh/",   port: 3007 },
  { name: "mem.sh",     url: "https://mem.prim.sh/",     port: 3008 },
  { name: "domain.sh",  url: "https://domain.prim.sh/",  port: 3009 },
  { name: "track.sh",   url: "https://track.prim.sh/",   port: 3010 },
];

// Spread VUs across services using round-robin based on __VU index
export default function () {
  const service = SERVICES[(__VU - 1) % SERVICES.length];

  const res = http.get(service.url, {
    tags: { service: service.name },
    timeout: "10s",
  });

  // Track custom metrics
  errorRate.add(res.status !== 200);
  serviceTrend.add(res.timings.duration, { service: service.name });

  const ok = check(res, {
    [`${service.name}: status 200`]: (r) => r.status === 200,
    [`${service.name}: has service field`]: (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.service === "string";
      } catch {
        return false;
      }
    },
    [`${service.name}: status ok`]: (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === "ok";
      } catch {
        return false;
      }
    },
    [`${service.name}: response < 500ms`]: (r) => r.timings.duration < 500,
  });

  if (!ok) {
    console.error(`[${service.name}] FAIL status=${res.status} body=${res.body.slice(0, 200)}`);
  }

  // 1–2s think time between requests (realistic agent polling cadence)
  sleep(1 + Math.random());
}

export function handleSummary(data) {
  const summary = buildSummary(data);
  return {
    stdout: summary,
    "tests/load/results/health-latest.json": JSON.stringify(data, null, 2),
  };
}

function buildSummary(data) {
  const metrics = data.metrics;
  const lines = [
    "",
    "=== prim.sh Health Load Test — Summary ===",
    "",
    `Total requests:  ${metrics.http_reqs?.values?.count ?? "n/a"}`,
    `Req/s (avg):     ${(metrics.http_reqs?.values?.rate ?? 0).toFixed(2)}`,
    `p50 latency:     ${(metrics.http_req_duration?.values?.["p(50)"] ?? 0).toFixed(0)}ms`,
    `p95 latency:     ${(metrics.http_req_duration?.values?.["p(95)"] ?? 0).toFixed(0)}ms`,
    `p99 latency:     ${(metrics.http_req_duration?.values?.["p(99)"] ?? 0).toFixed(0)}ms`,
    `Error rate:      ${((metrics.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%`,
    `Check pass rate: ${((metrics.checks?.values?.rate ?? 0) * 100).toFixed(2)}%`,
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
