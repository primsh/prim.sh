/**
 * k6 soak test: extended health sweep at low concurrency to detect memory leaks
 * and connection pool exhaustion over time.
 *
 * Intended to run overnight or for 1–2 hours in CI. Unlike the main health.js
 * test this holds a fixed low VU count for a long duration to reveal slow degradation.
 *
 * Usage:
 *   k6 run tests/load/soak.js
 *   k6 run --env DURATION=30m tests/load/soak.js   # shorten for quick validation
 *
 * Pass criteria:
 *   - p95 stays < 500ms for the entire test (no degradation over time)
 *   - error rate < 1%
 *   - no p99 > 2s (no occasional large spikes caused by GC or conn pool exhaustion)
 */

import { check, sleep } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const DURATION = __ENV.DURATION ?? "60m";

const errorRate = new Rate("soak_errors");
const latencyTrend = new Trend("soak_latency_ms", true);

export const options = {
  stages: [
    { duration: "1m", target: 5 }, // gentle ramp
    { duration: DURATION, target: 5 }, // sustained soak
    { duration: "1m", target: 0 }, // wind down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<2000"],
    http_req_failed: ["rate<0.01"],
    soak_errors: ["rate<0.01"],
    soak_latency_ms: ["p(95)<500"],
  },
};

const SERVICES = [
  { name: "wallet.sh", url: "https://wallet.prim.sh/" },
  { name: "faucet.sh", url: "https://faucet.prim.sh/" },
  { name: "store.sh", url: "https://store.prim.sh/" },
  { name: "spawn.sh", url: "https://spawn.prim.sh/" },
  { name: "search.sh", url: "https://search.prim.sh/" },
  { name: "email.sh", url: "https://email.prim.sh/" },
  { name: "domain.sh", url: "https://domain.prim.sh/" },
  { name: "track.sh", url: "https://track.prim.sh/" },
];

export default function () {
  const service = SERVICES[(__VU - 1) % SERVICES.length];

  const res = http.get(service.url, {
    tags: { service: service.name },
    timeout: "10s",
  });

  errorRate.add(res.status !== 200);
  latencyTrend.add(res.timings.duration, { service: service.name });

  check(res, {
    [`${service.name}: 200`]: (r) => r.status === 200,
    [`${service.name}: <500ms`]: (r) => r.timings.duration < 500,
  });

  // Longer think time for soak (2–4s) to avoid overwhelming a single-node VPS
  sleep(2 + Math.random() * 2);
}

export function handleSummary(data) {
  const m = data.metrics;
  const lines = [
    "",
    "=== prim.sh Soak Test — Summary ===",
    "",
    `Total requests:  ${m.http_reqs?.values?.count ?? "n/a"}`,
    `Duration:        ${DURATION}`,
    `p50 latency:     ${(m.http_req_duration?.values?.["p(50)"] ?? 0).toFixed(0)}ms`,
    `p95 latency:     ${(m.http_req_duration?.values?.["p(95)"] ?? 0).toFixed(0)}ms`,
    `p99 latency:     ${(m.http_req_duration?.values?.["p(99)"] ?? 0).toFixed(0)}ms`,
    `Error rate:      ${((m.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%`,
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
