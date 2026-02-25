/**
 * SP-8: Live smoke test against DigitalOcean API.
 * Tests the DO provider directly — creates a real droplet, verifies it, destroys it.
 *
 * Run:
 *   DO_API_TOKEN=dop_v1_xxx pnpm -C packages/spawn test:smoke
 *
 * Skips gracefully when DO_API_TOKEN is not set.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createDigitalOceanProvider } from "../src/digitalocean.ts";
import type { CloudProvider } from "../src/provider.ts";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const HAS_TOKEN = !!process.env.DO_API_TOKEN;

function generateTestSshKey(): string {
  const dir = mkdtempSync(join(tmpdir(), "spawn-smoke-"));
  const keyPath = join(dir, "id_ed25519");
  execSync(`ssh-keygen -t ed25519 -f ${keyPath} -N "" -q`);
  const pubKey = readFileSync(`${keyPath}.pub`, "utf-8").trim();
  rmSync(dir, { recursive: true });
  return pubKey;
}

// ─── Shared state ──────────────────────────────────────────────────────

let provider: CloudProvider;
let createdDropletId: string | null = null;
let createdSshKeyId: string | null = null;
const testTag = randomBytes(4).toString("hex");
const testName = `smoke-${testTag}`;

// ─── Helpers ───────────────────────────────────────────────────────────

async function pollUntil<T>(
  fn: () => Promise<T>,
  check: (result: T) => boolean,
  intervalMs: number,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (check(result)) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Poll timed out after ${timeoutMs}ms`);
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe.skipIf(!HAS_TOKEN)("spawn.sh DO live smoke test", { timeout: 180_000 }, () => {
  afterAll(async () => {
    if (!provider) return;

    // Always clean up droplet
    if (createdDropletId) {
      try {
        await provider.deleteServer(createdDropletId);
      } catch {
        // Already deleted or never fully created
      }
    }

    // Always clean up SSH key
    if (createdSshKeyId) {
      try {
        await provider.deleteSshKey(createdSshKeyId);
      } catch {
        // Already deleted
      }
    }
  });

  it("0. preflight — provider initializes", () => {
    requireEnv("DO_API_TOKEN");
    provider = createDigitalOceanProvider();
    expect(provider.name).toBe("digitalocean");
  });

  it("1. create SSH key", async () => {
    const pubKey = generateTestSshKey();
    const key = await provider.createSshKey({
      name: `smoke-test-${testTag}`,
      publicKey: pubKey,
    });

    expect(key.providerResourceId).toBeTruthy();
    expect(key.name).toBe(`smoke-test-${testTag}`);
    expect(key.fingerprint).toBeTruthy();
    createdSshKeyId = key.providerResourceId;
  });

  it("2. list SSH keys — test key appears", async () => {
    const keys = await provider.listSshKeys();
    const found = keys.find((k) => k.providerResourceId === createdSshKeyId);
    expect(found).toBeDefined();
    expect(found?.name).toBe(`smoke-test-${testTag}`);
  });

  it("3. create droplet", async () => {
    const result = await provider.createServer({
      name: testName,
      type: "s-1vcpu-1gb",
      image: "ubuntu-24.04",
      location: "nyc3",
      sshKeyIds: [createdSshKeyId!],
      labels: { env: "smoke-test" },
    });

    expect(result.server.providerResourceId).toBeTruthy();
    expect(result.server.name).toBe(testName);
    expect(result.action.id).toBeTruthy();
    createdDropletId = result.server.providerResourceId;
  });

  it("4. poll until active", async () => {
    const server = await pollUntil(
      () => provider.getServer(createdDropletId!),
      (s) => s.status === "active",
      5_000,
      120_000,
    );

    expect(server.status).toBe("active");
  });

  it("5. get droplet — verify fields", async () => {
    const server = await provider.getServer(createdDropletId!);

    expect(server.status).toBe("active");
    expect(server.ipv4).toBeTruthy();
    expect(server.image).toBe("ubuntu-24.04");
    expect(server.location).toBe("nyc3");
    expect(server.name).toBe(testName);
  });

  it("6. reboot", async () => {
    const action = await provider.rebootServer(createdDropletId!);

    expect(action.id).toBeTruthy();
    expect(action.command).toBe("reboot");
    expect(action.status).toBeTruthy();
  });

  it("7. delete droplet", async () => {
    await provider.deleteServer(createdDropletId!);
    createdDropletId = null; // Prevent afterAll double-delete
  });

  it("8. delete SSH key", async () => {
    await provider.deleteSshKey(createdSshKeyId!);
    createdSshKeyId = null; // Prevent afterAll double-delete
  });
});
