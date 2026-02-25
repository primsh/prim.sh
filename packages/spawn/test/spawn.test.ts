/**
 * SP-2 spawn.sh tests: server CRUD with Hetzner API mock and ownership enforcement.
 *
 * IMPORTANT: env vars must be set before any module import that touches db/hetzner.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set env before imports
process.env.SPAWN_DB_PATH = ":memory:";
process.env.HETZNER_API_KEY = "test-hetzner-key";

// ─── Hetzner API mock helpers ──────────────────────────────────────────────

function makeHetznerServer(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 12345,
    name: "test-server",
    status: "initializing",
    public_net: {
      ipv4: { ip: "1.2.3.4" },
      ipv6: { ip: "2001:db8::1" },
    },
    server_type: { name: "cx23" },
    image: { name: "ubuntu-24.04" },
    datacenter: { location: { name: "nbg1" } },
    labels: { wallet: "0xCa11e900000000000000000000000000000000001" },
    ...overrides,
  };
}

function makeHetznerAction(): Record<string, unknown> {
  return {
    id: 9999,
    command: "create_server",
    status: "running",
    started: "2024-01-01T00:00:00Z",
    finished: null,
  };
}

// Mock fetch: intercepts both x402 facilitator calls and Hetzner API calls
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

  // Hetzner: POST /v1/servers
  if (url === "https://api.hetzner.cloud/v1/servers" && _init?.method === "POST") {
    return new Response(
      JSON.stringify({
        server: makeHetznerServer(),
        action: makeHetznerAction(),
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  }

  // Hetzner: DELETE /v1/servers/:id
  if (url.startsWith("https://api.hetzner.cloud/v1/servers/") && _init?.method === "DELETE") {
    return new Response(null, { status: 204 });
  }

  // Hetzner: GET /v1/servers/:id (not a list)
  if (
    url.match(/^https:\/\/api\.hetzner\.cloud\/v1\/servers\/\d+$/) &&
    (!_init?.method || _init.method === "GET")
  ) {
    return new Response(
      JSON.stringify({ server: makeHetznerServer() }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Hetzner: GET /v1/servers (list with label_selector)
  if (url.startsWith("https://api.hetzner.cloud/v1/servers?") && (!_init?.method || _init.method === "GET")) {
    return new Response(
      JSON.stringify({
        servers: [makeHetznerServer()],
        meta: { pagination: { page: 1, per_page: 25, total_entries: 1 } },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

vi.stubGlobal("fetch", mockFetch);

// Import after env + fetch stub
import { resetDb, insertServer, getServerById } from "../src/db.ts";
import { createServer, listServers, getServer, deleteServer } from "../src/service.ts";
import type { CreateServerRequest } from "../src/api.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const CALLER = "0xCa11e900000000000000000000000000000000001";
const OTHER = "0xCa11e900000000000000000000000000000000002";

const VALID_REQUEST: CreateServerRequest = {
  name: "my-server",
  type: "small",
  image: "ubuntu-24.04",
  location: "nbg1",
};

function insertTestServer(overrides: Partial<Parameters<typeof insertServer>[0]> = {}): string {
  const id = `srv_test${Math.random().toString(16).slice(2, 6)}`;
  insertServer({
    id,
    hetzner_id: 12345,
    owner_wallet: CALLER,
    name: "test-server",
    type: "small",
    image: "ubuntu-24.04",
    location: "nbg1",
    status: "running",
    public_ipv4: "1.2.3.4",
    public_ipv6: null,
    deposit_charged: "0.01",
    deposit_daily_burn: "0.15",
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
    expect(result.data.deposit_charged).toBe("0.01");
  });

  it("create server — persists to SQLite", async () => {
    const result = await createServer(VALID_REQUEST, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = getServerById(result.data.server.id);
    expect(row).not.toBeNull();
    expect(row?.owner_wallet).toBe(CALLER);
    expect(row?.hetzner_id).toBe(12345);
  });

  it("create server — calls Hetzner with correct payload including wallet label", async () => {
    await createServer(VALID_REQUEST, CALLER);

    const hetznerCall = mockFetch.mock.calls.find(
      ([url, init]) =>
        url === "https://api.hetzner.cloud/v1/servers" && (init as RequestInit)?.method === "POST",
    );
    expect(hetznerCall).toBeDefined();

    const body = JSON.parse((hetznerCall?.[1] as RequestInit)?.body as string) as Record<string, unknown>;
    expect(body.server_type).toBe("cx23"); // small → cx23
    expect(body.image).toBe("ubuntu-24.04");
    expect(body.location).toBe("nbg1");
    expect((body.labels as Record<string, string>).wallet).toBe(CALLER);
  });

  it("invalid type — returns 400 with invalid_request", async () => {
    const result = await createServer({ ...VALID_REQUEST, type: "xlarge" as never }, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("invalid image — returns 400 with invalid_request", async () => {
    const result = await createServer({ ...VALID_REQUEST, image: "windows-11" as never }, CALLER);
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

  it("Hetzner API failure — returns 502 with hetzner_error code", async () => {
    mockFetch.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : (input as URL).toString();
      if (url === "https://api.hetzner.cloud/v1/servers" && (init as RequestInit)?.method === "POST") {
        return new Response(
          JSON.stringify({ error: { code: "server_error", message: "Internal server error" } }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const result = await createServer(VALID_REQUEST, CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
    expect(result.code).toBe("hetzner_error");
  });
});

// ─── List servers tests ───────────────────────────────────────────────────

describe("listServers", () => {
  it("list has servers — returns only servers owned by caller", () => {
    insertTestServer({ owner_wallet: CALLER });
    insertTestServer({ owner_wallet: CALLER });
    insertTestServer({ owner_wallet: OTHER }); // should not appear

    const result = listServers(CALLER, 20, 1);
    expect(result.servers).toHaveLength(2);
    for (const s of result.servers) {
      expect(s.owner_wallet).toBe(CALLER);
    }
  });

  it("list empty — returns empty array with meta", () => {
    const result = listServers(CALLER, 20, 1);
    expect(result.servers).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.page).toBe(1);
  });

  it("list — pagination meta is correct", () => {
    insertTestServer({ owner_wallet: CALLER });
    insertTestServer({ owner_wallet: CALLER });
    insertTestServer({ owner_wallet: CALLER });

    const result = listServers(CALLER, 2, 1);
    expect(result.servers).toHaveLength(2);
    expect(result.meta.per_page).toBe(2);
    expect(result.meta.total).toBe(3);
    expect(result.meta.page).toBe(1);
  });
});

// ─── Get server tests ─────────────────────────────────────────────────────

describe("getServer", () => {
  it("get server (owner) — returns full server detail", () => {
    const id = insertTestServer({ owner_wallet: CALLER });

    const result = getServer(id, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.id).toBe(id);
    expect(result.data.owner_wallet).toBe(CALLER);
    expect(result.data.status).toBe("running");
  });

  it("get server (not owner) — returns 403 forbidden", () => {
    const id = insertTestServer({ owner_wallet: CALLER });

    const result = getServer(id, OTHER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("forbidden");
  });

  it("get server (not found) — returns 404 not_found", () => {
    const result = getServer("srv_nonexist", CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
    expect(result.code).toBe("not_found");
  });
});

// ─── Delete server tests ──────────────────────────────────────────────────

describe("deleteServer", () => {
  it("delete server (owner) — calls Hetzner delete and returns deleted status", async () => {
    const id = insertTestServer({ owner_wallet: CALLER, hetzner_id: 12345 });

    const result = await deleteServer(id, CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.status).toBe("deleted");
    expect(typeof result.data.deposit_refunded).toBe("string");

    // Verify Hetzner delete was called
    const deleteCall = mockFetch.mock.calls.find(
      ([url, init]) =>
        (typeof url === "string" ? url : (url as Request).url).includes("/servers/12345") &&
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

  it("Hetzner delete failure — returns 502", async () => {
    const id = insertTestServer({ owner_wallet: CALLER, hetzner_id: 99999 });

    mockFetch.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : (input as URL).toString();
      if (url.includes("/servers/99999") && (init as RequestInit)?.method === "DELETE") {
        return new Response(
          JSON.stringify({ error: { code: "server_error", message: "Delete failed" } }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
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
    small: "cx23",
    medium: "cx33",
    large: "cx43",
    "arm-small": "cax11",
  };

  for (const [spawnType, hetznerType] of Object.entries(typeMap)) {
    it(`${spawnType} → ${hetznerType}`, async () => {
      await createServer({ ...VALID_REQUEST, type: spawnType as CreateServerRequest["type"] }, CALLER);

      const hetznerCall = mockFetch.mock.calls.find(
        ([url, init]) =>
          url === "https://api.hetzner.cloud/v1/servers" && (init as RequestInit)?.method === "POST",
      );
      const body = JSON.parse((hetznerCall?.[1] as RequestInit)?.body as string) as Record<string, unknown>;
      expect(body.server_type).toBe(hetznerType);

      resetDb();
      mockFetch.mockClear();
    });
  }
});
