// SPDX-License-Identifier: Apache-2.0
/**
 * Shared error response helpers.
 *
 * Every primitive returns errors in the same envelope:
 *   { error: { code: string; message: string } }
 *
 * The generic helpers (forbidden, notFound, invalidRequest, serviceError)
 * live here. Primitive-specific helpers (stalwartError, r2Error, etc.)
 * stay in their respective packages.
 */

export interface ApiError {
  error: { code: string; message: string };
}

export function forbidden(message: string): ApiError {
  return { error: { code: "forbidden", message } };
}

export function notFound(message: string): ApiError {
  return { error: { code: "not_found", message } };
}

export function invalidRequest(message: string): ApiError {
  return { error: { code: "invalid_request", message } };
}

export function serviceError(code: string, message: string): ApiError {
  return { error: { code, message } };
}
