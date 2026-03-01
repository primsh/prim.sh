// SPDX-License-Identifier: Apache-2.0
import type { MiddlewareHandler } from "hono";

/**
 * Middleware that adds X-Feedback-Url header to all responses.
 * For error responses (>= 400) with JSON bodies containing an `error` key,
 * also injects `feedback_url` into the response body.
 */
export function feedbackUrlMiddleware(url: string): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Always set the header
    c.header("X-Feedback-Url", url);

    // For error responses with JSON error bodies, inject feedback_url into body
    if (c.res.status >= 400) {
      const contentType = c.res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        try {
          const body = await c.res.clone().json();
          if (body && typeof body === "object" && "error" in body) {
            const newBody = { ...body, feedback_url: url };
            c.res = new Response(JSON.stringify(newBody), {
              status: c.res.status,
              headers: c.res.headers,
            });
          }
        } catch {
          // Not valid JSON despite content-type — leave as-is
        }
      }
    }
  };
}
