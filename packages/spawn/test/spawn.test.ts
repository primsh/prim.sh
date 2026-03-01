// SPDX-License-Identifier: Apache-2.0
/**
 * SP-2/SP-6/SP-7 spawn.sh tests: server CRUD with provider abstraction and ownership enforcement.
 * Tests use DigitalOcean as the default provider.
 *
 * IMPORTANT: env vars must be set before any module import that touches db/providers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Set env before imports
process.env.SPAWN_DB_PATH = ":memory:";
process.env.DO_API_TOKEN = "test-do-token";
process.env.HETZNER_API_KEY = "test-hetzner-key";

// ─── DO API mock helpers ─────────────────────────────────────────────────

function makeDOSshKey(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 55555,
    name: "my-key",
    fingerprint: "ab:cd:ef:00:11:22:33:44",
    public_key: "ssh-ed25519 AAAAC3NzaC test",
    ...overrides,
  };
}

function makeDODroplet(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 12345,
    name: "test-server",
    status: "new",
    networks: {
      v4: [{ ip_address: "1.2.3.4", netmask: "255.255.255.0", gateway: "1.2.3.1", type: "public" }],
      v6: [{ ip_address: "2001:db8::1", netmask: 64, gateway: "2001:db8::gw", type: "public" }],
    },
    size_slug: "s-2vcpu-4gb",
    image: { slug: "ubuntu-24-04-x64" },
    region: { slug: "nyc3" },
    tags: ["wallet:0xCa11e900000000000000000000000000000000001"],
    ...overrides,
  };
}

function makeDOAction(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 9999,
    type: "create_droplet",
    status: "in-progress",
    started_at: "2024-01-01T00:00:00Z",
    completed_at: null,
    resource_id: 12345,
    resource_type: "droplet",
    ...overrides,
  };
}

// Mock fetch: intercepts both x402 facilitator calls and DO API calls
const mockFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : (input as URL).toString();

  // x402 facilitator endpoint
  if (url.endsWith("/supported")) {
    return new Response(
      JSON.stringify({
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }],
        extensions: [],
        signers: {},
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // DO: POST /v2/droplets
  if (url === "https://api.digitalocean.com/v2/droplets" && _init?.method === "POST") {
    return new Response(
      JSON.stringify({
        droplet: makeDODroplet(),
        links: { actions: [{ id: 9999 }] },
      }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    );
  }

  // DO: DELETE /v2/droplets/:id
  if (
    url.match(/^https:\/\/api\.digitalocean\.com\/v2\/droplets\/\d+$/) &&
    _init?.method === "DELETE"
  ) {
    return new Response(null, { status: 204 });
  }

  // DO: POST /v2/droplets/:id/actions (lifecycle actions)
  if (
    url.match(/^https:\/\/api\.digitalocean\.com\/v2\/droplets\/\d+\/actions$/) &&
    _init?.method === "POST"
  ) {
    const body = JSON.parse((_init?.body as string) ?? "{}") as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        action: makeDOAction({
          type: body.type as string,
          id: body.type === "rebuild" ? 9998 : 9997,
        }),
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  }

  // DO: GET /v2/droplets/:id
  if (
    url.match(/^https:\/\/api\.digitalocean\.com\/v2\/droplets\/\d+$/) &&
    (!_init?.method || _init.method === "GET")
  ) {
    return new Response(JSON.stringify({ droplet: makeDODroplet() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // DO: POST /v2/account/keys — create SSH key
  if (url === "https://api.digitalocean.com/v2/account/keys" && _init?.method === "POST") {
    return new Response(JSON.stringify({ ssh_key: makeDOSshKey() }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  // DO: GET /v2/account/keys (list)
  if (
    url.startsWith("https://api.digitalocean.com/v2/account/keys") &&
    (!_init?.method || _init.method === "GET")
  ) {
    return new Response(JSON.stringify({ ssh_keys: [makeDOSshKey()] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // DO: DELETE /v2/account/keys/:id
  if (
    url.match(/^https:\/\/api\.digitalocean\.com\/v2\/account\/keys\/\d+$/) &&
    _init?.method === "DELETE"
  ) {
    return new Response(null, { status: 204 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

vi.stubGlobal("fetch", mockFetch);

import type { CreateServerRequest } from "../src/api.ts";
// Import after env + fetch stub
import { getServerById, getSshKeyById, insertServer, insertSshKey, resetDb } from "../src/db.ts";
import {
  createServer,
  deleteServer,
  deleteSshKey,
  getServer,
  listServers,
  listSshKeys,
  rebootServer,
  rebuildServer,
  registerSshKey,
  resizeServer,
  startServer,
  stopServer,
} from "../src/service.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const CALLER = "0xCa11e900000000000000000000000000000000001";
const OTHER = "0xCa11e900000000000000000000000000000000002";

const VALID_REQUEST: CreateServerRequest = {
  name: "my-server",
  type: "small",
  image: "ubuntu-24.04",
  location: "nyc3",
};

function insertTestServer(overrides: Partial<Parameters<typeof insertServer>[0]> = {}): string {
  const id = `srv_test${Math.random().toString(16).slice(2, 6)}`;
  insertServer({
    id,
    provider: "digitalocean",
    provider_resource_id: "12345",
    owner_wallet: CALLER,
    name: "test-server",
    type: "small",
    image: "ubuntu-24.04",
    location: "nyc3",
    status: "running",
    public_ipv4: "1.2.3.4",
    public_ipv6: null,
    deposit_charged: "0.01",
    deposit_daily_burn: "0.80",
    ...overrides,
  });
  return id;
}

function insertTestSshKey(overrides: Partial<Parameters<typeof insertSshKey>[0]> = {}): string {
  const id = `sk_test${Math.random().toString(16).slice(2, 6)}`;
  insertSshKey({
    id,
    provider: "digitalocean",
    provider_resource_id: "55555",
    owner_wallet: CALLER,
    name: "my-key",
    fingerprint: "ab:cd:ef:00:11:22:33:44",
    ...overrides,
  });
  return id;
}

beforeEach(() => {
  resetDb();
  mockFetch.mockClear();
});

afterEach(() => {
  resetDb();
});

// ─── Create server tests ──────────────────────────────────────────────────

describe("createServer", () => {
  it("create valid server — returns 201 with srv_ ID and initializing status", async () => {
    const result = await createServer(VALID_REQUEST, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.server.id).toMatch(/^srv_[0-9a-f]{8}$/);
    expect(result.data.server.status).toBe("initializing");
    expect(result.data.server.owner_wallet).toBe(CALLER);
    expect(result.data.server.type).toBe("small");
    expect(result.data.server.name).toBe("my-server");
    expect(result.data.server.provider).toBe("digitalocean");
    expect(result.data.server.provider_id).toBe("12345");
    expect(result.data.deposit_charged).toBe("0.01");
  });

  it("create server — persists to SQLite with provider fields", async () => {
    const result = await createServer(VALID_REQUEST, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = getServerById(result.data.server.id);
    expect(row).not.toBeNull();
    expect(row?.owner_wallet).toBe(CALLER);
    expect(row?.provider).toBe("digitalocean");
    expect(row?.provider_resource_id).toBe("12345");
  });

  it("create server — calls DO with correct payload including wallet tag", async () => {
    await createServer(VALID_REQUEST, CALLER);

    const doCall = mockFetch.mock.calls.find(
      ([url, init]) =>
        url === "https://api.digitalocean.com/v2/droplets" &&
        (init as RequestInit)?.method === "POST",
    );
    expect(doCall).toBeDefined();

    const body = JSON.parse((doCall?.[1] as RequestInit)?.body as string) as Record<
      string,
      unknown
    >;
    expect(body.size).toBe("s-2vcpu-4gb"); // small → s-2vcpu-4gb
    expect(body.image).toBe("ubuntu-24-04-x64"); // translated to DO slug
    expect(body.region).toBe("nyc3");
    expect(body.tags).toEqual([`wallet:${CALLER}`]);
  });

  it("create server with explicit provider — uses that provider", async () => {
    const result = await createServer({ ...VALID_REQUEST, provider: "digitalocean" }, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.server.provider).toBe("digitalocean");
  });

  it("create server with unknown provider — returns 400", async () => {
    const result = await createServer({ ...VALID_REQUEST, provider: "nonexistent" }, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
    expect(result.message).toContain("Unknown provider");
  });

  it("invalid type — blocked by beta allowlist returns 403 type_not_allowed", async () => {
    const result = await createServer({ ...VALID_REQUEST, type: "xlarge" }, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("type_not_allowed");
  });

  it("arm-small not available on DO — blocked by beta allowlist returns 403 type_not_allowed", async () => {
    const result = await createServer({ ...VALID_REQUEST, type: "arm-small" }, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("type_not_allowed");
  });

  it("invalid image — returns 400 with invalid_request", async () => {
    const result = await createServer({ ...VALID_REQUEST, image: "windows-11" }, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("invalid name (special chars) — returns 400 with invalid_request", async () => {
    const result = await createServer({ ...VALID_REQUEST, name: "bad name!" }, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("server limit exceeded — returns 403 with server_limit_exceeded code", async () => {
    // Insert 3 active servers for the caller
    insertTestServer({ owner_wallet: CALLER, status: "running" });
    insertTestServer({ owner_wallet: CALLER, status: "initializing" });
    insertTestServer({ owner_wallet: CALLER, status: "off" });

    const result = await createServer(VALID_REQUEST, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("server_limit_exceeded");
    expect(result.message).toBe("Max 3 concurrent servers per wallet");
  });

  it("server limit — deleted/archived/destroying servers do not count", async () => {
    // Insert 3 servers in terminal states — should not count toward cap
    insertTestServer({ owner_wallet: CALLER, status: "deleted" });
    insertTestServer({ owner_wallet: CALLER, status: "archived" });
    insertTestServer({ owner_wallet: CALLER, status: "destroying" });

    const result = await createServer(VALID_REQUEST, CALLER);
    expect(result.ok).toBe(true);
  });

  it("server limit — other wallets' servers do not count toward cap", async () => {
    // Insert 3 active servers for OTHER wallet — should not affect CALLER
    insertTestServer({ owner_wallet: OTHER, status: "running" });
    insertTestServer({ owner_wallet: OTHER, status: "running" });
    insertTestServer({ owner_wallet: OTHER, status: "running" });

    const result = await createServer(VALID_REQUEST, CALLER);
    expect(result.ok).toBe(true);
  });

  it("type not allowed — non-small type returns 403 with type_not_allowed code", async () => {
    const result = await createServer({ ...VALID_REQUEST, type: "medium" }, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("type_not_allowed");
    expect(result.message).toContain("small");
  });

  it("type not allowed — large type returns 403 with type_not_allowed code", async () => {
    const result = await createServer({ ...VALID_REQUEST, type: "large" }, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("type_not_allowed");
  });

  it("DO API failure — returns 502 with provider_error code", async () => {
    mockFetch.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : (input as URL).toString();
      if (
        url === "https://api.digitalocean.com/v2/droplets" &&
        (init as RequestInit)?.method === "POST"
      ) {
        return new Response(
          JSON.stringify({ id: "server_error", message: "Internal server error" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await createServer(VALID_REQUEST, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
    expect(result.code).toBe("provider_error");
  });
});

// ─── List servers tests ───────────────────────────────────────────────────

describe("listServers", () => {
  it("list has servers — returns only servers owned by caller", () => {
    insertTestServer({ owner_wallet: CALLER });
    insertTestServer({ owner_wallet: CALLER });
    insertTestServer({ owner_wallet: OTHER }); // should not appear

    const result = listServers(CALLER, 20, 1);
    expect(result.data).toHaveLength(2);
    for (const s of result.data) {
      expect(s.owner_wallet).toBe(CALLER);
    }
  });

  it("list empty — returns empty array with meta", () => {
    const result = listServers(CALLER, 20, 1);
    expect(result.data).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.page).toBe(1);
  });

  it("list — pagination meta is correct", () => {
    insertTestServer({ owner_wallet: CALLER });
    insertTestServer({ owner_wallet: CALLER });
    insertTestServer({ owner_wallet: CALLER });

    const result = listServers(CALLER, 2, 1);
    expect(result.data).toHaveLength(2);
    expect(result.pagination.per_page).toBe(2);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.page).toBe(1);
  });
});

// ─── Get server tests ─────────────────────────────────────────────────────

describe("getServer", () => {
  it("get server (owner) — returns full server detail with provider fields", async () => {
    const id = insertTestServer({ owner_wallet: CALLER });

    const result = await getServer(id, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.id).toBe(id);
    expect(result.data.owner_wallet).toBe(CALLER);
    expect(result.data.status).toBe("new");
    expect(result.data.provider).toBe("digitalocean");
    expect(result.data.provider_id).toBe("12345");
  });

  it("get server (not owner) — returns 403 forbidden", async () => {
    const id = insertTestServer({ owner_wallet: CALLER });

    const result = await getServer(id, OTHER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("forbidden");
  });

  it("get server (not found) — returns 404 not_found", async () => {
    const result = await getServer("srv_nonexist", CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
    expect(result.code).toBe("not_found");
  });
});

// ─── Delete server tests ──────────────────────────────────────────────────

describe("deleteServer", () => {
  it("delete server (owner) — calls provider delete and returns deleted status", async () => {
    const id = insertTestServer({ owner_wallet: CALLER, provider_resource_id: "12345" });

    const result = await deleteServer(id, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.status).toBe("deleted");
    expect(typeof result.data.deposit_refunded).toBe("string");

    // Verify DO delete was called
    const deleteCall = mockFetch.mock.calls.find(
      ([url, init]) =>
        (typeof url === "string" ? url : (url as Request).url).includes("/droplets/12345") &&
        (init as RequestInit)?.method === "DELETE",
    );
    expect(deleteCall).toBeDefined();
  });

  it("delete server — updates status to destroying in SQLite", async () => {
    const id = insertTestServer({ owner_wallet: CALLER });

    await deleteServer(id, CALLER);

    const row = getServerById(id);
    expect(row?.status).toBe("destroying");
  });

  it("delete server (not owner) — returns 403 forbidden", async () => {
    const id = insertTestServer({ owner_wallet: CALLER });

    const result = await deleteServer(id, OTHER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("forbidden");
  });

  it("DO delete failure — returns 502", async () => {
    const id = insertTestServer({ owner_wallet: CALLER, provider_resource_id: "99999" });

    mockFetch.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : (input as URL).toString();
      if (url.includes("/droplets/99999") && (init as RequestInit)?.method === "DELETE") {
        return new Response(JSON.stringify({ id: "server_error", message: "Delete failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    });

    const result = await deleteServer(id, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
  });
});

// ─── Type translation tests ───────────────────────────────────────────────

describe("server type translation", () => {
  const typeMap: Record<string, string> = {
    small: "s-2vcpu-4gb",
    medium: "s-4vcpu-8gb",
    large: "s-8vcpu-16gb",
  };

  for (const [spawnType, doType] of Object.entries(typeMap)) {
    it(`${spawnType} → ${doType}`, async () => {
      // Allow all types for these provider-level translation tests
      const origAllowed = process.env.SPAWN_ALLOWED_TYPES;
      process.env.SPAWN_ALLOWED_TYPES = "small,medium,large,arm-small";

      await createServer({ ...VALID_REQUEST, type: spawnType }, CALLER);

      process.env.SPAWN_ALLOWED_TYPES = origAllowed;

      const doCall = mockFetch.mock.calls.find(
        ([url, init]) =>
          url === "https://api.digitalocean.com/v2/droplets" &&
          (init as RequestInit)?.method === "POST",
      );
      const body = JSON.parse((doCall?.[1] as RequestInit)?.body as string) as Record<
        string,
        unknown
      >;
      expect(body.size).toBe(doType);

      resetDb();
      mockFetch.mockClear();
    });
  }
});

// ─── VM lifecycle action tests ─────────────────────────────────────────────

describe("startServer", () => {
  it("start server (owner) — returns 200 with action object", async () => {
    const id = insertTestServer({ owner_wallet: CALLER, provider_resource_id: "12345" });
    const result = await startServer(id, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.action.id).toBe("9997");
    expect(typeof result.data.action.status).toBe("string");
  });

  it("start server (not owner) — returns 403", async () => {
    const id = insertTestServer({ owner_wallet: CALLER });
    const result = await startServer(id, OTHER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("forbidden");
  });

  it("Provider action failure — returns 502", async () => {
    const id = insertTestServer({ owner_wallet: CALLER, provider_resource_id: "77777" });
    mockFetch.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : (input as URL).toString();
      if (url.includes("/droplets/77777/actions") && (init as RequestInit)?.method === "POST") {
        return new Response(JSON.stringify({ id: "server_error", message: "Action failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await startServer(id, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
  });
});

describe("stopServer", () => {
  it("stop server (owner) — returns 200 with action object", async () => {
    const id = insertTestServer({ owner_wallet: CALLER, provider_resource_id: "12345" });
    const result = await stopServer(id, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.action.id).toBe("9997");
  });
});

describe("rebootServer", () => {
  it("reboot server (owner) — returns 200 with action object", async () => {
    const id = insertTestServer({ owner_wallet: CALLER, provider_resource_id: "12345" });
    const result = await rebootServer(id, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.action.id).toBe("9997");
  });
});

describe("resizeServer", () => {
  it("resize server (valid type) — returns 200 with action and new_type", async () => {
    const id = insertTestServer({ owner_wallet: CALLER, provider_resource_id: "12345" });
    const result = await resizeServer(id, CALLER, { type: "medium" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.new_type).toBe("medium");
    expect(typeof result.data.action.id).toBe("string");
  });

  it("resize server (invalid type) — returns 400", async () => {
    const id = insertTestServer({ owner_wallet: CALLER });
    const result = await resizeServer(id, CALLER, { type: "xlarge" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });
});

describe("rebuildServer", () => {
  it("rebuild server (valid image) — returns 200 with action", async () => {
    const id = insertTestServer({ owner_wallet: CALLER, provider_resource_id: "12345" });
    const result = await rebuildServer(id, CALLER, { image: "debian-12" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.action.id).toBe("9998");
    expect(result.data.root_password).toBeNull();
  });

  it("rebuild server (invalid image) — returns 400", async () => {
    const id = insertTestServer({ owner_wallet: CALLER });
    const result = await rebuildServer(id, CALLER, { image: "windows-11" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });
});

// ─── SSH key tests ─────────────────────────────────────────────────────────

describe("registerSshKey", () => {
  it("register SSH key — returns 201 with sk_ id and fingerprint", async () => {
    const result = await registerSshKey(
      { name: "my-key", public_key: "ssh-ed25519 AAAAC3NzaC test" },
      CALLER,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toMatch(/^sk_[0-9a-f]{8}$/);
    expect(result.data.fingerprint).toBe("ab:cd:ef:00:11:22:33:44");
    expect(result.data.owner_wallet).toBe(CALLER);
    expect(result.data.provider).toBe("digitalocean");
    expect(result.data.provider_id).toBe("55555");
  });

  it("register SSH key — missing fields returns 400", async () => {
    const result = await registerSshKey({ name: "", public_key: "" }, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });
});

describe("listSshKeys", () => {
  it("list SSH keys (has keys) — returns array with owner's keys", () => {
    insertTestSshKey({ owner_wallet: CALLER });
    insertTestSshKey({ owner_wallet: CALLER });
    insertTestSshKey({ owner_wallet: OTHER });

    const result = listSshKeys(CALLER);
    expect(result.data).toHaveLength(2);
    for (const k of result.data) {
      expect(k.owner_wallet).toBe(CALLER);
    }
  });

  it("list SSH keys (empty) — returns empty array", () => {
    const result = listSshKeys(CALLER);
    expect(result.data).toHaveLength(0);
  });
});

describe("deleteSshKey", () => {
  it("delete SSH key (owner) — removes from SQLite and calls provider delete", async () => {
    const id = insertTestSshKey({ owner_wallet: CALLER, provider_resource_id: "55555" });

    const result = await deleteSshKey(id, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("deleted");

    expect(getSshKeyById(id)).toBeNull();
  });

  it("delete SSH key (not owner) — returns 403", async () => {
    const id = insertTestSshKey({ owner_wallet: CALLER });
    const result = await deleteSshKey(id, OTHER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("forbidden");
  });

  it("delete SSH key (not found) — returns 404", async () => {
    const result = await deleteSshKey("sk_notexist", CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
    expect(result.code).toBe("not_found");
  });
});
