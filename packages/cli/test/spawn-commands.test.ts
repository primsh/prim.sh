// SPDX-License-Identifier: Apache-2.0
/**
 * spawn-commands.ts unit tests.
 *
 * createPrimFetch is fully mocked — no network, no keystore, no x402 payments.
 * getConfig is mocked to return empty config (no network override).
 * node:fs is partially mocked for readFileSync (ssh-key add --file).
 */

import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@primsh/x402-client", () => ({
  createPrimFetch: vi.fn(),
}));

vi.mock("@primsh/keystore", () => ({
  getConfig: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import { readFileSync } from "node:fs";
import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "@primsh/keystore";
import { resolveSpawnUrl, runSpawnCommand } from "../src/spawn-commands.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okCreateServer(id = "srv_123") {
  return jsonResponse(200, {
    server: {
      id,
      provider: "digitalocean",
      provider_id: "do_123",
      name: "my-server",
      type: "small",
      status: "initializing",
      image: "ubuntu-24.04",
      location: "nyc3",
      public_net: { ipv4: { ip: "1.2.3.4" }, ipv6: null },
      owner_wallet: "0xABC",
      created_at: "2026-01-01T00:00:00Z",
    },
    action: {
      id: "act_1",
      command: "create",
      status: "in-progress",
      started_at: "2026-01-01T00:00:00Z",
      finished_at: null,
    },
    deposit_charged: "5.00",
    deposit_remaining: "95.00",
  });
}

function okServerList(ids = ["srv_1", "srv_2"]) {
  return jsonResponse(200, {
    servers: ids.map((id) => ({
      id,
      provider: "digitalocean",
      provider_id: `do_${id}`,
      name: id,
      type: "small",
      status: "running",
      image: "ubuntu-24.04",
      location: "nyc3",
      public_net: { ipv4: { ip: "1.2.3.4" }, ipv6: null },
      owner_wallet: "0xABC",
      created_at: "2026-01-01T00:00:00Z",
    })),
    meta: { page: 1, per_page: 20, total: ids.length },
  });
}

function okGetServer(id = "srv_123") {
  return jsonResponse(200, {
    id,
    provider: "digitalocean",
    provider_id: "do_123",
    name: "my-server",
    type: "small",
    status: "running",
    image: "ubuntu-24.04",
    location: "nyc3",
    public_net: { ipv4: { ip: "1.2.3.4" }, ipv6: null },
    owner_wallet: "0xABC",
    created_at: "2026-01-01T00:00:00Z",
  });
}

function okDeleted() {
  return jsonResponse(200, { status: "deleted", deposit_refunded: "5.00" });
}

function okAction(command = "reboot") {
  return jsonResponse(200, {
    action: {
      id: "act_1",
      command,
      status: "in-progress",
      started_at: "2026-01-01T00:00:00Z",
      finished_at: null,
    },
  });
}

function okSshKey(id = "key_123") {
  return jsonResponse(200, {
    id,
    provider: "digitalocean",
    provider_id: "do_key_123",
    name: "my-key",
    fingerprint: "aa:bb:cc:dd",
    owner_wallet: "0xABC",
    created_at: "2026-01-01T00:00:00Z",
  });
}

function okSshKeyList(ids = ["key_1", "key_2"]) {
  return jsonResponse(200, {
    ssh_keys: ids.map((id) => ({
      id,
      provider: "digitalocean",
      provider_id: `do_${id}`,
      name: id,
      fingerprint: "aa:bb:cc:dd",
      owner_wallet: "0xABC",
      created_at: "2026-01-01T00:00:00Z",
    })),
  });
}

function okSshKeyDeleted() {
  return jsonResponse(200, { status: "deleted" });
}

function errorResponse(code: string, message: string, status = 404) {
  return jsonResponse(status, { error: { code, message } });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let mockFetch: ReturnType<typeof vi.fn>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let consoleLogSpy: MockInstance<any[], any>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let stderrSpy: MockInstance<any[], any>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let exitSpy: MockInstance<any[], never>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.mocked(createPrimFetch).mockReturnValue(mockFetch as typeof fetch);
  vi.mocked(getConfig).mockResolvedValue({});
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
    throw new Error(`process.exit(${_code})`);
  });
  // biome-ignore lint/performance/noDelete: env var must be absent, not the string "undefined"
  delete process.env.PRIM_SPAWN_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  // biome-ignore lint/performance/noDelete: env var must be absent, not the string "undefined"
  delete process.env.PRIM_SPAWN_URL;
});

// ─── 1. create ───────────────────────────────────────────────────────────────

describe("create", () => {
  it("POSTs to /v1/servers with body and prints JSON", async () => {
    mockFetch.mockResolvedValue(okCreateServer());
    await runSpawnCommand("create", [
      "spawn",
      "create",
      "--name=my-server",
      "--type=small",
      "--image=ubuntu-24.04",
      "--location=nyc3",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://spawn.prim.sh/v1/servers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "my-server",
          type: "small",
          image: "ubuntu-24.04",
          location: "nyc3",
        }),
      }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("srv_123"));
  });

  it("includes ssh_keys when --ssh-keys flag is provided", async () => {
    mockFetch.mockResolvedValue(okCreateServer());
    await runSpawnCommand("create", [
      "spawn",
      "create",
      "--name=my-server",
      "--ssh-keys=key_1,key_2",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('"ssh_keys":["key_1","key_2"]'),
      }),
    );
  });

  it("--quiet prints only the server ID", async () => {
    mockFetch.mockResolvedValue(okCreateServer("srv_abc"));
    await runSpawnCommand("create", ["spawn", "create", "--name=x", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledWith("srv_abc");
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it("--name VALUE (space-separated) is accepted", async () => {
    mockFetch.mockResolvedValue(okCreateServer());
    await runSpawnCommand("create", ["spawn", "create", "--name", "my-server"]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('"name":"my-server"'),
      }),
    );
  });

  it("--ssh-keys VALUE (space-separated) splits on commas", async () => {
    mockFetch.mockResolvedValue(okCreateServer());
    await runSpawnCommand("create", [
      "spawn",
      "create",
      "--name=my-server",
      "--ssh-keys",
      "key_a,key_b",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('"ssh_keys":["key_a","key_b"]'),
      }),
    );
  });

  it("--ssh-keys=SINGLE sends single-element array (not char-by-char)", async () => {
    mockFetch.mockResolvedValue(okCreateServer());
    await runSpawnCommand("create", [
      "spawn",
      "create",
      "--name=my-server",
      "--ssh-keys=sk_abc",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('"ssh_keys":["sk_abc"]'),
      }),
    );
  });

  it("exits 1 when --name is missing", async () => {
    await expect(runSpawnCommand("create", ["spawn", "create"])).rejects.toThrow("process.exit(1)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("--name NAME"));
  });
});

// ─── 2. ls ───────────────────────────────────────────────────────────────────

describe("ls", () => {
  it("GETs /v1/servers with default pagination and prints JSON", async () => {
    mockFetch.mockResolvedValue(okServerList());
    await runSpawnCommand("ls", ["spawn", "ls"]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("/v1/servers");
    expect(url).toContain("page=1");
    expect(url).toContain("limit=20");
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("srv_1"));
  });

  it("passes --page and --per-page to query string", async () => {
    mockFetch.mockResolvedValue(okServerList());
    await runSpawnCommand("ls", ["spawn", "ls", "--page=2", "--per-page=5"]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("page=2");
    expect(url).toContain("limit=5");
  });

  it("--quiet prints one server ID per line", async () => {
    mockFetch.mockResolvedValue(okServerList(["srv_1", "srv_2", "srv_3"]));
    await runSpawnCommand("ls", ["spawn", "ls", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledTimes(3);
    expect(consoleLogSpy).toHaveBeenCalledWith("srv_1");
    expect(consoleLogSpy).toHaveBeenCalledWith("srv_2");
    expect(consoleLogSpy).toHaveBeenCalledWith("srv_3");
  });
});

// ─── 3. get ──────────────────────────────────────────────────────────────────

describe("get", () => {
  it("GETs /v1/servers/:id and prints formatted output", async () => {
    mockFetch.mockResolvedValue(okGetServer("srv_abc"));
    await runSpawnCommand("get", ["spawn", "get", "srv_abc"]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://spawn.prim.sh/v1/servers/srv_abc");
    expect(consoleLogSpy).toHaveBeenCalledWith("Server srv_abc");
    expect(consoleLogSpy).toHaveBeenCalledWith("  Status:  running");
    expect(consoleLogSpy).toHaveBeenCalledWith("  IP:      1.2.3.4");
    expect(consoleLogSpy).toHaveBeenCalledWith("  Image:   ubuntu-24.04");
    expect(consoleLogSpy).toHaveBeenCalledWith("  Created: 2026-01-01T00:00:00Z");
  });

  it("--quiet prints only the IPv4 IP", async () => {
    mockFetch.mockResolvedValue(okGetServer());
    await runSpawnCommand("get", ["spawn", "get", "srv_123", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledWith("1.2.3.4");
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it("--json flag outputs JSON", async () => {
    mockFetch.mockResolvedValue(okGetServer("srv_json"));
    await runSpawnCommand("get", ["spawn", "get", "srv_json", "--json"]);
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const output = consoleLogSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe("srv_json");
    expect(parsed.status).toBe("running");
    expect(parsed.public_net.ipv4.ip).toBe("1.2.3.4");
  });

  it("exits 1 when server ID is missing", async () => {
    await expect(runSpawnCommand("get", ["spawn", "get"])).rejects.toThrow("process.exit(1)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("SERVER_ID"));
  });
});

// ─── 4. rm ───────────────────────────────────────────────────────────────────

describe("rm", () => {
  it("DELETEs /v1/servers/:id and prints result", async () => {
    mockFetch.mockResolvedValue(okDeleted());
    await runSpawnCommand("rm", ["spawn", "rm", "srv_123"]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://spawn.prim.sh/v1/servers/srv_123",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("deleted"));
  });

  it("--quiet suppresses output", async () => {
    mockFetch.mockResolvedValue(okDeleted());
    await runSpawnCommand("rm", ["spawn", "rm", "srv_123", "--quiet"]);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("exits 1 when server ID is missing", async () => {
    await expect(runSpawnCommand("rm", ["spawn", "rm"])).rejects.toThrow("process.exit(1)");
  });
});

// ─── 5. reboot ───────────────────────────────────────────────────────────────

describe("reboot", () => {
  it("POSTs to /v1/servers/:id/reboot", async () => {
    mockFetch.mockResolvedValue(okAction("reboot"));
    await runSpawnCommand("reboot", ["spawn", "reboot", "srv_123"]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://spawn.prim.sh/v1/servers/srv_123/reboot",
      expect.objectContaining({ method: "POST" }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("reboot"));
  });

  it("exits 1 when server ID is missing", async () => {
    await expect(runSpawnCommand("reboot", ["spawn", "reboot"])).rejects.toThrow("process.exit(1)");
  });
});

// ─── 6. stop ─────────────────────────────────────────────────────────────────

describe("stop", () => {
  it("POSTs to /v1/servers/:id/stop", async () => {
    mockFetch.mockResolvedValue(okAction("stop"));
    await runSpawnCommand("stop", ["spawn", "stop", "srv_123"]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://spawn.prim.sh/v1/servers/srv_123/stop",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("exits 1 when server ID is missing", async () => {
    await expect(runSpawnCommand("stop", ["spawn", "stop"])).rejects.toThrow("process.exit(1)");
  });
});

// ─── 7. start ────────────────────────────────────────────────────────────────

describe("start", () => {
  it("POSTs to /v1/servers/:id/start", async () => {
    mockFetch.mockResolvedValue(okAction("start"));
    await runSpawnCommand("start", ["spawn", "start", "srv_123"]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://spawn.prim.sh/v1/servers/srv_123/start",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("exits 1 when server ID is missing", async () => {
    await expect(runSpawnCommand("start", ["spawn", "start"])).rejects.toThrow("process.exit(1)");
  });
});

// ─── 8. ssh-key add ──────────────────────────────────────────────────────────

describe("ssh-key add", () => {
  it("POSTs to /v1/ssh-keys with name and public_key", async () => {
    mockFetch.mockResolvedValue(okSshKey());
    await runSpawnCommand("ssh-key", [
      "spawn",
      "ssh-key",
      "add",
      "--name=my-key",
      "--public-key=ssh-ed25519 AAAAC3...",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://spawn.prim.sh/v1/ssh-keys",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "my-key", public_key: "ssh-ed25519 AAAAC3..." }),
      }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("key_123"));
  });

  it("reads public key from --file", async () => {
    vi.mocked(readFileSync).mockReturnValue("ssh-ed25519 AAAAC3FromFile\n");
    mockFetch.mockResolvedValue(okSshKey());
    await runSpawnCommand("ssh-key", [
      "spawn",
      "ssh-key",
      "add",
      "--name=file-key",
      "--file=/tmp/id_ed25519.pub",
    ]);
    expect(readFileSync).toHaveBeenCalledWith("/tmp/id_ed25519.pub", "utf-8");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: JSON.stringify({ name: "file-key", public_key: "ssh-ed25519 AAAAC3FromFile" }),
      }),
    );
  });

  it("--quiet prints only the key ID", async () => {
    mockFetch.mockResolvedValue(okSshKey("key_quiet"));
    await runSpawnCommand("ssh-key", [
      "spawn",
      "ssh-key",
      "add",
      "--name=k",
      "--public-key=ssh-ed25519 X",
      "--quiet",
    ]);
    expect(consoleLogSpy).toHaveBeenCalledWith("key_quiet");
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it("exits 1 when --name is missing", async () => {
    await expect(
      runSpawnCommand("ssh-key", ["spawn", "ssh-key", "add", "--public-key=ssh-ed25519 X"]),
    ).rejects.toThrow("process.exit(1)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("--name NAME"));
  });

  it("exits 1 when neither --public-key nor --file is provided", async () => {
    await expect(
      runSpawnCommand("ssh-key", ["spawn", "ssh-key", "add", "--name=k"]),
    ).rejects.toThrow("process.exit(1)");
  });
});

// ─── 9. ssh-key ls ───────────────────────────────────────────────────────────

describe("ssh-key ls", () => {
  it("GETs /v1/ssh-keys and prints JSON", async () => {
    mockFetch.mockResolvedValue(okSshKeyList());
    await runSpawnCommand("ssh-key", ["spawn", "ssh-key", "ls"]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://spawn.prim.sh/v1/ssh-keys");
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("key_1"));
  });

  it("--quiet prints one key ID per line", async () => {
    mockFetch.mockResolvedValue(okSshKeyList(["key_a", "key_b"]));
    await runSpawnCommand("ssh-key", ["spawn", "ssh-key", "ls", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenCalledWith("key_a");
    expect(consoleLogSpy).toHaveBeenCalledWith("key_b");
  });
});

// ─── 10. ssh-key rm ──────────────────────────────────────────────────────────

describe("ssh-key rm", () => {
  it("DELETEs /v1/ssh-keys/:id", async () => {
    mockFetch.mockResolvedValue(okSshKeyDeleted());
    await runSpawnCommand("ssh-key", ["spawn", "ssh-key", "rm", "key_123"]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://spawn.prim.sh/v1/ssh-keys/key_123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("--quiet suppresses output", async () => {
    mockFetch.mockResolvedValue(okSshKeyDeleted());
    await runSpawnCommand("ssh-key", ["spawn", "ssh-key", "rm", "key_123", "--quiet"]);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("exits 1 when key ID is missing", async () => {
    await expect(runSpawnCommand("ssh-key", ["spawn", "ssh-key", "rm"])).rejects.toThrow(
      "process.exit(1)",
    );
  });
});

// ─── 11. error handling ──────────────────────────────────────────────────────

describe("error handling", () => {
  it("non-ok response throws error with message and code", async () => {
    mockFetch.mockResolvedValue(errorResponse("not_found", "Server not found"));
    await expect(runSpawnCommand("get", ["spawn", "get", "srv_missing"])).rejects.toThrow(
      "Server not found (not_found)",
    );
  });

  it("403 forbidden error is reported correctly", async () => {
    mockFetch.mockResolvedValue(errorResponse("forbidden", "Access denied", 403));
    await expect(runSpawnCommand("rm", ["spawn", "rm", "srv_xyz"])).rejects.toThrow(
      "Access denied (forbidden)",
    );
  });
});

// ─── 12. URL resolution ─────────────────────────────────────────────────────

describe("URL resolution", () => {
  it("--url flag takes highest priority", () => {
    process.env.PRIM_SPAWN_URL = "https://env.example.com";
    const url = resolveSpawnUrl(["spawn", "ls", "--url=https://flag.example.com"]);
    expect(url).toBe("https://flag.example.com");
  });

  it("--url VALUE (space-separated) is accepted", () => {
    const url = resolveSpawnUrl(["spawn", "ls", "--url", "https://space.example.com"]);
    expect(url).toBe("https://space.example.com");
  });

  it("PRIM_SPAWN_URL env is used when no --url flag", () => {
    process.env.PRIM_SPAWN_URL = "https://env.example.com";
    const url = resolveSpawnUrl(["spawn", "ls"]);
    expect(url).toBe("https://env.example.com");
  });

  it("falls back to https://spawn.prim.sh", () => {
    // biome-ignore lint/performance/noDelete: env var must be absent, not the string "undefined"
    delete process.env.PRIM_SPAWN_URL;
    const url = resolveSpawnUrl(["spawn", "ls"]);
    expect(url).toBe("https://spawn.prim.sh");
  });

  it("integration: runSpawnCommand uses --url for fetch calls", async () => {
    mockFetch.mockResolvedValue(okServerList());
    await runSpawnCommand("ls", ["spawn", "ls", "--url=https://custom.prim.sh"]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("https://custom.prim.sh/v1/servers");
  });
});

// ─── 13. default subcommand ──────────────────────────────────────────────────

describe("unknown subcommand", () => {
  it("prints usage and exits 1", async () => {
    await expect(runSpawnCommand("foobar", ["spawn", "foobar"])).rejects.toThrow("process.exit(1)");
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });
});
