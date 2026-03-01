// SPDX-License-Identifier: Apache-2.0

/** Unwrap a fetch Response, throwing on non-ok with structured error info. */
export async function unwrap<T>(res: Response): Promise<T> {
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
    throw new Error(`${msg} (${code})`);
  }
  return res.json() as Promise<T>;
}
