// SPDX-License-Identifier: Apache-2.0
// ─── Track ───────────────────────────────────────────────────────────────────

import { z } from "zod";

export const TrackRequestSchema = z.object({
  tracking_number: z.string().describe("Shipment tracking number."),
  carrier: z
    .string()
    .optional()
    .describe('Carrier slug (e.g. "usps", "ups", "fedex"). Omit to auto-detect.'),
});
export type TrackRequest = z.infer<typeof TrackRequestSchema>;

export const TrackLocationSchema = z.object({
  city: z.string().optional().describe("City name."),
  state: z.string().optional().describe("State or province."),
  zip: z.string().optional().describe("Postal code."),
  country: z.string().optional().describe("Two-letter ISO 3166-1 country code."),
});
export type TrackLocation = z.infer<typeof TrackLocationSchema>;

export const TrackEventSchema = z.object({
  status: z.string().describe('Event status summary (e.g. "In Transit").'),
  status_detail: z.string().describe("Detailed status description."),
  datetime: z.string().describe("ISO 8601 timestamp of the event."),
  location: TrackLocationSchema.optional().describe("Location where the event occurred."),
});
export type TrackEvent = z.infer<typeof TrackEventSchema>;

export const TrackResponseSchema = z.object({
  tracking_number: z.string().describe("Tracking number echoed back."),
  carrier: z.string().describe("Detected or specified carrier slug."),
  status: z.string().describe('Current status summary (e.g. "Delivered").'),
  status_detail: z.string().describe("Detailed current status description."),
  eta: z
    .string()
    .optional()
    .describe("Estimated delivery date (ISO 8601). Only present if available."),
  location: TrackLocationSchema.optional().describe(
    "Current package location. Only present if available.",
  ),
  events: z
    .array(TrackEventSchema)
    .describe("Chronological list of tracking events (newest first)."),
});
export type TrackResponse = z.infer<typeof TrackResponseSchema>;

// ─── Error ───────────────────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe("Machine-readable error code."),
    message: z.string().describe("Human-readable error message."),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ERROR_CODES = [
  "invalid_request",
  "not_found",
  "rate_limited",
  "provider_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
