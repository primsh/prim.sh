import type { Context } from "hono";
import { forbidden, invalidRequest } from "./errors.js";
import type { Logger } from "./logger.js";

/**
 * Extract the caller wallet address from x402 middleware context.
 * Returns the address string, or a 403 Response if missing.
 */
export function requireCaller(c: Context): string | Response {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);
  return caller;
}

/**
 * Parse a JSON request body with standardized error handling.
 * Returns the parsed body, or a 400 Response on parse failure.
 */
export async function parseJsonBody<T>(
  c: Context,
  logger: Logger,
  label: string,
): Promise<T | Response> {
  try {
    return await c.req.json<T>();
  } catch (err) {
    logger.warn(`JSON parse failed on ${label}`, { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }
}
