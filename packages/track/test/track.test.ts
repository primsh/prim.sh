/**
 * TR-1 track.sh tests: package tracking via Shippo.
 * Service functions accept injectable providers so tests avoid real Shippo calls.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ProviderError } from "../src/provider.ts";
import { trackPackage, normalizeCarrier, resetClient } from "../src/service.ts";
import type { TrackProvider, TrackProviderData } from "../src/provider.ts";

// ─── Mock providers ───────────────────────────────────────────────────────────

function makeTrackData(overrides: Partial<TrackProviderData> = {}): TrackProviderData {
  return {
    tracking_number: "9400111899223397910435",
    carrier: "usps",
    status: "TRANSIT",
    status_detail: "In transit to destination",
    eta: "2026-03-01T00:00:00Z",
    location: { city: "Memphis", state: "TN", zip: "38101", country: "US" },
    events: [
      {
        status: "TRANSIT",
        status_detail: "Arrived at facility",
        datetime: "2026-02-26T10:00:00Z",
        location: { city: "Memphis", state: "TN", zip: "38101", country: "US" },
      },
      {
        status: "PRE_TRANSIT",
        status_detail: "Shipment accepted",
        datetime: "2026-02-25T09:00:00Z",
        location: { city: "Austin", state: "TX", zip: "78701", country: "US" },
      },
    ],
    ...overrides,
  };
}

class MockTrackProvider implements TrackProvider {
  capturedNumber = "";
  capturedCarrier = "";

  async track(trackingNumber: string, carrier: string): Promise<TrackProviderData> {
    this.capturedNumber = trackingNumber;
    this.capturedCarrier = carrier;
    return makeTrackData({ tracking_number: trackingNumber, carrier });
  }
}

class NotFoundTrackProvider implements TrackProvider {
  async track(trackingNumber: string, carrier: string): Promise<TrackProviderData> {
    throw new ProviderError(
      `Tracking number ${trackingNumber} not found for carrier ${carrier}`,
      "not_found",
    );
  }
}

class RateLimitedTrackProvider implements TrackProvider {
  async track(): Promise<TrackProviderData> {
    throw new ProviderError("Shippo rate limit exceeded", "rate_limited", 30);
  }
}

class ErrorTrackProvider implements TrackProvider {
  async track(): Promise<TrackProviderData> {
    throw new ProviderError("Upstream API error", "provider_error");
  }
}

class DeliveredTrackProvider implements TrackProvider {
  async track(trackingNumber: string, carrier: string): Promise<TrackProviderData> {
    return makeTrackData({
      tracking_number: trackingNumber,
      carrier,
      status: "DELIVERED",
      status_detail: "Delivered to front door",
      eta: undefined,
      events: [
        {
          status: "DELIVERED",
          status_detail: "Delivered to front door",
          datetime: "2026-02-26T14:30:00Z",
          location: { city: "San Francisco", state: "CA", zip: "94105", country: "US" },
        },
        {
          status: "TRANSIT",
          status_detail: "Out for delivery",
          datetime: "2026-02-26T08:00:00Z",
          location: { city: "San Francisco", state: "CA", zip: "94105", country: "US" },
        },
      ],
    });
  }
}

// ─── normalizeCarrier ─────────────────────────────────────────────────────────

describe("normalizeCarrier", () => {
  it("lowercases known slugs", () => {
    expect(normalizeCarrier("usps")).toBe("usps");
    expect(normalizeCarrier("fedex")).toBe("fedex");
    expect(normalizeCarrier("ups")).toBe("ups");
    expect(normalizeCarrier("dhl_express")).toBe("dhl");
  });

  it("normalizes uppercase aliases", () => {
    expect(normalizeCarrier("USPS")).toBe("usps");
    expect(normalizeCarrier("FedEx")).toBe("fedex");
    expect(normalizeCarrier("UPS")).toBe("ups");
    expect(normalizeCarrier("DHL")).toBe("dhl");
  });

  it("normalizes phrase aliases", () => {
    expect(normalizeCarrier("Federal Express")).toBe("fedex");
    expect(normalizeCarrier("DHL Express")).toBe("dhl");
    expect(normalizeCarrier("United States Postal Service")).toBe("usps");
    expect(normalizeCarrier("United Parcel Service")).toBe("ups");
  });

  it("passes unknown carriers through lowercased", () => {
    expect(normalizeCarrier("purolator")).toBe("purolator");
    expect(normalizeCarrier("Australia Post")).toBe("australia_post");
  });
});

// ─── trackPackage ─────────────────────────────────────────────────────────────

describe("trackPackage", () => {
  beforeEach(() => {
    resetClient();
  });

  it("returns 400 when tracking_number is missing", async () => {
    const result = await trackPackage({ tracking_number: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    }
  });

  it("returns 400 when tracking_number is whitespace only", async () => {
    const result = await trackPackage({ tracking_number: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    }
  });

  it("returns TrackResponse on success", async () => {
    const provider = new MockTrackProvider();
    const result = await trackPackage({ tracking_number: "9400111899223397910435", carrier: "usps" }, provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tracking_number).toBe("9400111899223397910435");
      expect(result.data.carrier).toBe("usps");
      expect(result.data.status).toBe("TRANSIT");
      expect(Array.isArray(result.data.events)).toBe(true);
    }
  });

  it("defaults carrier to usps when not provided", async () => {
    const provider = new MockTrackProvider();
    await trackPackage({ tracking_number: "9400111899223397910435" }, provider);
    expect(provider.capturedCarrier).toBe("usps");
  });

  it("normalizes carrier before calling provider", async () => {
    const provider = new MockTrackProvider();
    await trackPackage({ tracking_number: "123456789", carrier: "FedEx" }, provider);
    expect(provider.capturedCarrier).toBe("fedex");
  });

  it("trims tracking_number before calling provider", async () => {
    const provider = new MockTrackProvider();
    await trackPackage({ tracking_number: "  9400111899223397910435  " }, provider);
    expect(provider.capturedNumber).toBe("9400111899223397910435");
  });

  it("returns 404 when provider throws not_found", async () => {
    const result = await trackPackage({ tracking_number: "BADNUM", carrier: "usps" }, new NotFoundTrackProvider());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("not_found");
    }
  });

  it("returns 429 with retryAfter when provider throws rate_limited", async () => {
    const result = await trackPackage({ tracking_number: "123", carrier: "usps" }, new RateLimitedTrackProvider());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.code).toBe("rate_limited");
      expect(result.retryAfter).toBe(30);
    }
  });

  it("returns 502 when provider throws provider_error", async () => {
    const result = await trackPackage({ tracking_number: "123", carrier: "usps" }, new ErrorTrackProvider());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.code).toBe("provider_error");
    }
  });

  it("events are in newest-first order", async () => {
    const provider = new DeliveredTrackProvider();
    const result = await trackPackage({ tracking_number: "123", carrier: "usps" }, provider);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const events = result.data.events;
      expect(events.length).toBeGreaterThan(1);
      expect(events[0].status).toBe("DELIVERED");
      expect(events[1].status).toBe("TRANSIT");
    }
  });

  it("returns DELIVERED status correctly", async () => {
    const result = await trackPackage(
      { tracking_number: "9400111899223397910435", carrier: "usps" },
      new DeliveredTrackProvider(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("DELIVERED");
    }
  });
});

// ─── HTTP layer (index.ts) ────────────────────────────────────────────────────

describe("HTTP /v1/track", () => {
  // Import app after setting required env vars
  beforeEach(() => {
    process.env.PRIM_NETWORK = "eip155:8453";
    resetClient();
  });

  it("GET / returns health check without 402", async () => {
    const { default: app } = await import("../src/index.ts");
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "track.sh", status: "ok" });
  });
});
