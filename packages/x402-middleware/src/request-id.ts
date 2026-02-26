import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareHandler } from "hono";

const als = new AsyncLocalStorage<string>();

/**
 * Returns the request ID for the current async context, or null if outside a request.
 */
export function getRequestId(): string | null {
  return als.getStore() ?? null;
}

/**
 * Hono middleware that assigns a request ID to each request.
 * Reads `X-Request-Id` from the incoming request if present, otherwise generates one.
 * Stores it in AsyncLocalStorage (for logger) and Hono context (for handlers).
 * Sets `X-Request-Id` response header for client correlation.
 */
export function requestIdMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const id = c.req.header("x-request-id") ?? crypto.randomUUID().slice(0, 12);
    c.set("requestId", id);
    c.header("X-Request-Id", id);
    await als.run(id, next);
  };
}
