// SPDX-License-Identifier: Apache-2.0
import type { Context } from "hono";
import type { ZodType } from "zod";
import { ZodError } from "zod";
import { forbidden, invalidRequest } from "./errors.js";
import type { Logger } from "./logger.js";

export function requireCaller(c: Context): string | Response {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);
  return caller;
}

export async function parseJsonBody<T>(
  c: Context,
  logger: Logger,
  label: string,
  schema?: ZodType<T>,
): Promise<T | Response> {
  try {
    const raw = await c.req.json();
    if (schema) return schema.parse(raw);
    return raw as T;
  } catch (err) {
    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            code: "validation_error",
            message: "Invalid request body",
            issues: err.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
    logger.warn(`JSON parse failed on ${label}`, { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }
}
