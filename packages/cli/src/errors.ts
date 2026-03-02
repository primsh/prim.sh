// SPDX-License-Identifier: Apache-2.0

/**
 * Shared error handler for CLI command files.
 *
 * Handles both standard `{ error: { code, message } }` and
 * string-only `{ error: "message" }` response shapes.
 */
export async function handleApiError(res: Response): Promise<never> {
  let message = `HTTP ${res.status}`;
  let code = "unknown";
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } | string };
    if (body.error) {
      if (typeof body.error === "string") {
        message = body.error;
      } else {
        message = body.error.message ?? message;
        code = body.error.code ?? code;
      }
    }
  } catch {
    // ignore parse error
  }
  throw new Error(`${message} (${code})`);
}
