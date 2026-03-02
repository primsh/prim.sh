// SPDX-License-Identifier: Apache-2.0

/** Structured error thrown by SDK methods on non-ok responses. */
export class PrimError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PrimError";
  }
}

/** Unwrap a fetch Response, throwing PrimError on non-ok. Returns undefined for 204 No Content. */
export async function unwrap<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let code = "unknown";
    try {
      const body = (await res.json()) as { error?: { code: string; message: string } };
      if (body.error) {
        msg = body.error.message;
        code = body.error.code;
      }
    } catch {}
    throw new PrimError(res.status, code, msg);
  }
  return res.json() as Promise<T>;
}
