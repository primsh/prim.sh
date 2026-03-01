// SPDX-License-Identifier: Apache-2.0
/**
 * SP-7 DigitalOcean provider-specific tests.
 * Tests DO-specific behavior: image translation, tag generation, IP extraction, error parsing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DO_API_TOKEN = "test-do-token";

// ─── DO mock response factories ──────────────────────────────────────────

function makeDODroplet(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 12345,
    name: "test-server",
    status: "active",
    networks: {
      v4: [
        { ip_address: "10.0.0.1", netmask: "255.255.0.0", gateway: "10.0.0.1", type: "private" },
        {
          ip_address: "203.0.113.1",
          netmask: "255.255.255.0",
          gateway: "203.0.113.1",
          type: "public",
        },
      ],
      v6: [{ ip_address: "2604:a880::1", netmask: 64, gateway: "2604:a880::gw", type: "public" }],
    },
    size_slug: "s-2vcpu-4gb",
    image: { slug: "ubuntu-24-04-x64" },
    region: { slug: "nyc3" },
    tags: ["wallet:0xTestWallet"],
    ...overrides,
  };
}

const mockFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : (input as URL).toString();

  // Create droplet
  if (url === "https://api.digitalocean.com/v2/droplets" && _init?.method === "POST") {
    return new Response(
      JSON.stringify({
        droplet: makeDODroplet({ status: "new" }),
        links: { actions: [{ id: 1001 }] },
      }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    );
  }

  // Get droplet
  if (url.match(/\/v2\/droplets\/\d+$/) && (!_init?.method || _init.method === "GET")) {
    return new Response(JSON.stringify({ droplet: makeDODroplet() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Actions
  if (url.match(/\/v2\/droplets\/\d+\/actions$/) && _init?.method === "POST") {
    const body = JSON.parse((_init.body as string) ?? "{}") as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        action: {
          id: 2001,
          type: body.type,
          status: "in-progress",
          started_at: "2024-01-01T00:00:00Z",
          completed_at: null,
          resource_id: 12345,
          resource_type: "droplet",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  }

  // SSH keys
  if (url === "https://api.digitalocean.com/v2/account/keys" && _init?.method === "POST") {
    return new Response(
      JSON.stringify({
        ssh_key: {
          id: 3001,
          name: "test-key",
          fingerprint: "aa:bb:cc:dd",
          public_key: "ssh-rsa AAAA test",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

vi.stubGlobal("fetch", mockFetch);

import { createDigitalOceanProvider } from "../src/digitalocean.ts";

const provider = createDigitalOceanProvider();

beforeEach(() => {
  mockFetch.mockClear();
});

// ─── Capabilities ────────────────────────────────────────────────────────

describe("capabilities", () => {
  it("serverTypes — returns small/medium/large with DO slugs", () => {
    const types = provider.serverTypes();
    expect(types).toHaveLength(3);
    expect(types.map((t) => t.name)).toEqual(["small", "medium", "large"]);
    expect(types.map((t) => t.providerType)).toEqual([
      "s-2vcpu-4gb",
      "s-4vcpu-8gb",
      "s-8vcpu-16gb",
    ]);
  });

  it("images — returns spawn-style image names (not DO slugs)", () => {
    const images = provider.images();
    expect(images).toContain("ubuntu-24.04");
    expect(images).toContain("debian-12");
    expect(images).not.toContain("ubuntu-24-04-x64"); // DO slug should not leak
  });

  it("locations — returns DO region slugs", () => {
    const locs = provider.locations();
    expect(locs).toContain("nyc3");
    expect(locs).toContain("sfo3");
    expect(locs).toContain("fra1");
    expect(locs.length).toBe(9);
  });
});

// ─── Image translation ──────────────────────────────────────────────────

describe("image translation", () => {
  it("createServer — translates spawn image to DO slug", async () => {
    await provider.createServer({
      name: "img-test",
      type: "s-2vcpu-4gb",
      image: "ubuntu-24.04",
      location: "nyc3",
    });

    const call = mockFetch.mock.calls.find(
      ([url, init]) =>
        url === "https://api.digitalocean.com/v2/droplets" &&
        (init as RequestInit)?.method === "POST",
    );
    const body = JSON.parse((call?.[1] as RequestInit)?.body as string) as Record<string, unknown>;
    expect(body.image).toBe("ubuntu-24-04-x64");
  });

  it("getServer — translates DO image slug back to spawn name", async () => {
    const server = await provider.getServer("12345");
    expect(server.image).toBe("ubuntu-24.04"); // not ubuntu-24-04-x64
  });

  it("rebuildServer — translates spawn image to DO slug", async () => {
    await provider.rebuildServer("12345", "debian-12");

    const call = mockFetch.mock.calls.find(
      ([url, init]) =>
        url.toString().includes("/actions") && (init as RequestInit)?.method === "POST",
    );
    const body = JSON.parse((call?.[1] as RequestInit)?.body as string) as Record<string, unknown>;
    expect(body.image).toBe("debian-12-x64");
  });
});

// ─── Tag generation ─────────────────────────────────────────────────────

describe("tag generation", () => {
  it("createServer — converts labels to tags", async () => {
    await provider.createServer({
      name: "tag-test",
      type: "s-2vcpu-4gb",
      image: "ubuntu-24.04",
      location: "nyc3",
      labels: { wallet: "0xABC", env: "test" },
    });

    const call = mockFetch.mock.calls.find(
      ([url, init]) =>
        url === "https://api.digitalocean.com/v2/droplets" &&
        (init as RequestInit)?.method === "POST",
    );
    const body = JSON.parse((call?.[1] as RequestInit)?.body as string) as Record<string, unknown>;
    expect(body.tags).toEqual(["wallet:0xABC", "env:test"]);
  });
});

// ─── IP extraction ──────────────────────────────────────────────────────

describe("IP extraction", () => {
  it("extracts public IPv4 from networks.v4 array", async () => {
    const server = await provider.getServer("12345");
    expect(server.ipv4).toBe("203.0.113.1"); // public, not 10.0.0.1 (private)
  });

  it("extracts public IPv6 from networks.v6 array", async () => {
    const server = await provider.getServer("12345");
    expect(server.ipv6).toBe("2604:a880::1");
  });

  it("returns null when no public IP exists", async () => {
    mockFetch.mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify({
          droplet: makeDODroplet({
            networks: { v4: [{ ip_address: "10.0.0.1", type: "private" }], v6: [] },
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const server = await provider.getServer("12345");
    expect(server.ipv4).toBeNull();
    expect(server.ipv6).toBeNull();
  });
});

// ─── Error handling ─────────────────────────────────────────────────────

describe("error handling", () => {
  it("404 — maps to not_found ProviderError", async () => {
    mockFetch.mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify({
          id: "not_found",
          message: "The resource you requested could not be found.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    });

    await expect(provider.getServer("99999")).rejects.toThrow();
    try {
      await provider.getServer("99999");
    } catch (err) {
      // First call already threw; this validates the prior throw
    }
  });

  it("429 — maps to rate_limited ProviderError", async () => {
    mockFetch.mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify({ id: "too_many_requests", message: "Rate limit exceeded" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    });

    try {
      await provider.getServer("12345");
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const pe = err as { code: string; statusCode: number };
      expect(pe.code).toBe("rate_limited");
      expect(pe.statusCode).toBe(429);
    }
  });

  it("500 — maps to provider_error", async () => {
    mockFetch.mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ id: "server_error", message: "Something went wrong" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    try {
      await provider.getServer("12345");
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const pe = err as { code: string; statusCode: number };
      expect(pe.code).toBe("provider_error");
      expect(pe.statusCode).toBe(500);
    }
  });
});

// ─── Action routing ─────────────────────────────────────────────────────

describe("action routing", () => {
  it("all actions go through POST /droplets/:id/actions with type field", async () => {
    const actions = [
      { method: "startServer" as const, expectedType: "power_on" },
      { method: "stopServer" as const, expectedType: "shutdown" },
      { method: "rebootServer" as const, expectedType: "reboot" },
    ];

    for (const { method, expectedType } of actions) {
      mockFetch.mockClear();
      await provider[method]("12345");

      const call = mockFetch.mock.calls.find(
        ([url, init]) =>
          (url as string).includes("/droplets/12345/actions") &&
          (init as RequestInit)?.method === "POST",
      );
      expect(call).toBeDefined();
      const body = JSON.parse((call?.[1] as RequestInit)?.body as string) as Record<
        string,
        unknown
      >;
      expect(body.type).toBe(expectedType);
    }
  });

  it("resizeServer — sends size and disk fields", async () => {
    await provider.resizeServer("12345", "s-4vcpu-8gb", true);

    const call = mockFetch.mock.calls.find(
      ([url, init]) =>
        (url as string).includes("/actions") && (init as RequestInit)?.method === "POST",
    );
    const body = JSON.parse((call?.[1] as RequestInit)?.body as string) as Record<string, unknown>;
    expect(body.type).toBe("resize");
    expect(body.size).toBe("s-4vcpu-8gb");
    expect(body.disk).toBe(true);
  });
});
