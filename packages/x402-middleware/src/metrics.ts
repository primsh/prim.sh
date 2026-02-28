import type { Handler, MiddlewareHandler } from "hono";

const MAX_LATENCY_SAMPLES = 1000;
const startTime = Date.now();

interface EndpointMetrics {
  count: number;
  errors: number;
  payments: number;
  latencies: number[];
}

const endpoints = new Map<string, EndpointMetrics>();
const errorsByStatus = new Map<number, number>();
let totalRequests = 0;
let totalErrors = 0;
let totalPayments = 0;

function getEndpoint(key: string): EndpointMetrics {
  let m = endpoints.get(key);
  if (!m) {
    m = { count: 0, errors: 0, payments: 0, latencies: [] };
    endpoints.set(key, m);
  }
  return m;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function metricsMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const latency = Date.now() - start;

    const method = c.req.method;
    const path = c.req.routePath ?? new URL(c.req.url).pathname;
    const key = `${method} ${path}`;
    const status = c.res.status;

    const ep = getEndpoint(key);
    ep.count++;
    totalRequests++;

    if (ep.latencies.length >= MAX_LATENCY_SAMPLES) {
      ep.latencies.shift();
    }
    ep.latencies.push(latency);

    if (status >= 400 && status !== 402) {
      ep.errors++;
      totalErrors++;
      errorsByStatus.set(status, (errorsByStatus.get(status) ?? 0) + 1);
    }

    const paid =
      c.res.headers.get("x-payment-verified") !== null ||
      (c.req.header("payment-signature") !== undefined && status >= 200 && status < 300);
    if (paid) {
      ep.payments++;
      totalPayments++;
    }
  };
}

export function metricsHandler(serviceName: string): Handler {
  return (c) => {
    const byEndpoint: Record<
      string,
      { count: number; errors: number; p50_ms: number; p99_ms: number }
    > = {};
    const paymentsByEndpoint: Record<string, number> = {};

    for (const [key, ep] of endpoints) {
      const sorted = [...ep.latencies].sort((a, b) => a - b);
      byEndpoint[key] = {
        count: ep.count,
        errors: ep.errors,
        p50_ms: percentile(sorted, 50),
        p99_ms: percentile(sorted, 99),
      };
      if (ep.payments > 0) {
        paymentsByEndpoint[key] = ep.payments;
      }
    }

    const byStatus: Record<string, number> = {};
    for (const [status, count] of errorsByStatus) {
      byStatus[String(status)] = count;
    }

    return c.json({
      service: serviceName,
      uptime_s: Math.floor((Date.now() - startTime) / 1000),
      requests: {
        total: totalRequests,
        by_endpoint: byEndpoint,
      },
      payments: {
        total: totalPayments,
        by_endpoint: paymentsByEndpoint,
      },
      errors: {
        total: totalErrors,
        by_status: byStatus,
      },
    });
  };
}

export function resetMetrics(): void {
  endpoints.clear();
  errorsByStatus.clear();
  totalRequests = 0;
  totalErrors = 0;
  totalPayments = 0;
}
