import type { X402MiddlewareOptions, X402RouteConfig } from "./types.ts";

export interface X402Context {
  requestId: string;
}

export function createX402Middleware(
  _options: X402MiddlewareOptions,
  _routes: X402RouteConfig[],
) {
  return async function x402Middleware(_ctx: unknown, next: () => Promise<unknown>) {
    await next();
  };
}

