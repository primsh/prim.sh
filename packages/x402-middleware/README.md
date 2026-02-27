# @primsh/x402-middleware

Shared x402 payment middleware for all prim primitives. Provides Hono middleware that enforces x402 payment requirements, along with network configuration, metrics, logging, and request ID utilities.

## Install

```bash
pnpm install
```

## Build

```bash
pnpm --filter @primsh/x402-middleware build
```

## Test

```bash
pnpm --filter @primsh/x402-middleware test
```

## Exports

- `createAgentStackMiddleware` -- Hono middleware that enforces x402 payment on configured routes
- `getNetworkConfig` -- returns chain ID, USDC address, and testnet flag for the configured network
- `createWalletAllowlistChecker` -- creates a function that checks wallet allowlist via wallet.sh internal API
- `metricsMiddleware` / `metricsHandler` -- request metrics collection and Prometheus-style endpoint
- `requestIdMiddleware` -- attaches a unique request ID to each request
- `logger` -- structured logger

## Usage

```ts
import { createAgentStackMiddleware, getNetworkConfig } from "@primsh/x402-middleware";

app.use("*", createAgentStackMiddleware(
  { payTo: ADDRESS, network: NETWORK, freeRoutes: ["GET /"] },
  { "POST /v1/action": "$0.01" },
));
```
