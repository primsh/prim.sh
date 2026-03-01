// SPDX-License-Identifier: Apache-2.0
import { insertFeedback } from "./db.ts";

const VALID_TYPES = ["bug", "friction", "feature", "praise"] as const;
const MAX_BODY_LENGTH = 5000;

export interface SubmitRequest {
  primitive: string;
  endpoint?: string;
  type: string;
  body: string;
  wallet?: string;
  request_id?: string;
}

export interface SubmitResult {
  ok: true;
  data: { id: string; status: "received" };
}

export interface SubmitError {
  ok: false;
  status: number;
  code: string;
  message: string;
}

export function submit(req: SubmitRequest): SubmitResult | SubmitError {
  if (!req.primitive || typeof req.primitive !== "string") {
    return { ok: false, status: 400, code: "invalid_request", message: "primitive is required" };
  }
  if (!req.type || !VALID_TYPES.includes(req.type as (typeof VALID_TYPES)[number])) {
    return { ok: false, status: 400, code: "invalid_request", message: `type must be one of: ${VALID_TYPES.join(", ")}` };
  }
  if (!req.body || typeof req.body !== "string") {
    return { ok: false, status: 400, code: "invalid_request", message: "body is required" };
  }
  if (req.body.length > MAX_BODY_LENGTH) {
    return { ok: false, status: 400, code: "invalid_request", message: `body must be ${MAX_BODY_LENGTH} characters or fewer` };
  }

  const id = crypto.randomUUID().slice(0, 12);
  insertFeedback({
    id,
    primitive: req.primitive,
    endpoint: req.endpoint ?? null,
    type: req.type,
    body: req.body,
    wallet: req.wallet ?? null,
    request_id: req.request_id ?? null,
  });

  return { ok: true, data: { id, status: "received" } };
}
