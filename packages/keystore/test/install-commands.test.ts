import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/testuser"),
}));

vi.mock("../src/config.ts", () => ({
  getDefaultAddress: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { getDefaultAddress } from "../src/config.ts";
import {
  detectAgent,
  generateMcpConfig,
  mergeIntoConfigFile,
  removeFromConfigFile,
  runInstallCommand,
  runUninstallCommand,
  runSkillCommand,
  runListCommand,
} from "../src/install-commands.ts";

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockWriteFileSync = writeFileSync as ReturnType<typeof vi.fn>;
const mockMkdirSync = mkdirSync as ReturnType<typeof vi.fn>;
const mockGetDefaultAddress = getDefaultAddress as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDefaultAddress.mockResolvedValue("0xabc123");
});

// ---------------------------------------------------------------------------
// detectAgent
// ---------------------------------------------------------------------------

describe("detectAgent", () => {
  it("uses --agent flag override", () => {
    expect(detectAgent(["install", "store", "--agent", "cursor"])).toBe("cursor");
    expect(detectAgent(["install", "store", "--agent=generic"])).toBe("generic");
    expect(detectAgent(["install", "store", "--agent", "claude"])).toBe("claude");
  });

  it("detects claude when ~/.claude/ exists", () => {
    mockExistsSync.mockImplementation((p: string) => p === "/home/testuser/.claude");
    expect(detectAgent(["install", "store"])).toBe("claude");
  });

  it("detects cursor when .cursor/ exists in cwd tree", () => {
    const cwd = process.cwd();
    mockExistsSync.mockImplementation((p: string) => {
      if (p === "/home/testuser/.claude") return false;
      if (p === `${cwd}/.cursor`) return true;
      return false;
    });
    expect(detectAgent(["install", "store"])).toBe("cursor");
  });

  it("falls back to generic", () => {
    mockExistsSync.mockReturnValue(false);
    expect(detectAgent(["install", "store"])).toBe("generic");
  });

  it("--agent flag overrides even when ~/.claude exists", () => {
    mockExistsSync.mockImplementation((p: string) => p === "/home/testuser/.claude");
    expect(detectAgent(["install", "store", "--agent", "generic"])).toBe("generic");
  });
});

// ---------------------------------------------------------------------------
// generateMcpConfig
// ---------------------------------------------------------------------------

describe("generateMcpConfig", () => {
  it("generates config for a single primitive", () => {
    expect(generateMcpConfig(["store"])).toEqual({
      mcpServers: {
        "prim-store": { command: "prim", args: ["mcp", "--primitives", "store"] },
      },
    });
  });

  it("generates config for all primitives", () => {
    expect(generateMcpConfig(["wallet", "store", "spawn", "faucet", "search", "email", "mem", "domain", "token"])).toEqual({
      mcpServers: {
        prim: { command: "prim", args: ["mcp"] },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// mergeIntoConfigFile
// ---------------------------------------------------------------------------

describe("mergeIntoConfigFile", () => {
  it("creates new file when config does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const config = { mcpServers: { "prim-store": { command: "prim", args: ["mcp", "--primitives", "store"] } } };

    mergeIntoConfigFile("/home/testuser/.claude/mcp.json", config);

    expect(mockMkdirSync).toHaveBeenCalledWith("/home/testuser/.claude", { recursive: true });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1].replace(/\n$/, ""));
    expect(written.mcpServers["prim-store"]).toEqual({ command: "prim", args: ["mcp", "--primitives", "store"] });
  });

  it("merges into existing config without removing other keys", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      mcpServers: { "other-tool": { command: "x" } },
    }));

    const config = { mcpServers: { "prim-store": { command: "prim", args: ["mcp", "--primitives", "store"] } } };
    mergeIntoConfigFile("/path/mcp.json", config);

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1].replace(/\n$/, ""));
    expect(written.mcpServers["other-tool"]).toEqual({ command: "x" });
    expect(written.mcpServers["prim-store"]).toEqual({ command: "prim", args: ["mcp", "--primitives", "store"] });
  });

  it("overwrites existing prim key (idempotent)", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      mcpServers: { "prim-store": { command: "old", args: ["old"] } },
    }));

    const config = { mcpServers: { "prim-store": { command: "prim", args: ["mcp", "--primitives", "store"] } } };
    mergeIntoConfigFile("/path/mcp.json", config);

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1].replace(/\n$/, ""));
    expect(written.mcpServers["prim-store"]).toEqual({ command: "prim", args: ["mcp", "--primitives", "store"] });
  });

  it("throws on corrupt JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not valid json {{{");

    expect(() => {
      mergeIntoConfigFile("/path/mcp.json", { mcpServers: {} });
    }).toThrow("Cannot parse");

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeFromConfigFile
// ---------------------------------------------------------------------------

describe("removeFromConfigFile", () => {
  it("removes a specific prim key but leaves others", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      mcpServers: {
        "other-tool": { command: "x" },
        "prim-store": { command: "prim", args: ["mcp", "--primitives", "store"] },
        "prim-wallet": { command: "prim", args: ["mcp", "--primitives", "wallet"] },
      },
    }));

    removeFromConfigFile("/path/mcp.json", ["store"]);

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1].replace(/\n$/, ""));
    expect(written.mcpServers["other-tool"]).toEqual({ command: "x" });
    expect(written.mcpServers["prim-wallet"]).toBeDefined();
    expect(written.mcpServers["prim-store"]).toBeUndefined();
  });

  it("removes all prim keys when uninstalling all", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      mcpServers: {
        "other-tool": { command: "x" },
        prim: { command: "prim", args: ["mcp"] },
        "prim-store": { command: "prim", args: ["mcp", "--primitives", "store"] },
      },
    }));

    removeFromConfigFile("/path/mcp.json", ["wallet", "store", "spawn", "faucet", "search", "email", "mem", "domain", "token"]);

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1].replace(/\n$/, ""));
    expect(written.mcpServers["other-tool"]).toEqual({ command: "x" });
    expect(written.mcpServers.prim).toBeUndefined();
    expect(written.mcpServers["prim-store"]).toBeUndefined();
  });

  it("throws when config file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => removeFromConfigFile("/path/mcp.json", ["store"])).toThrow("does not exist");
  });

  it("throws on corrupt JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("bad json");
    expect(() => removeFromConfigFile("/path/mcp.json", ["store"])).toThrow("Cannot parse");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runInstallCommand (integration-style with mocked fs)
// ---------------------------------------------------------------------------

describe("runInstallCommand", () => {
  it("outputs JSON for --agent generic", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await runInstallCommand("store", ["install", "store", "--agent", "generic"]);

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    expect(output).toEqual({
      mcpServers: {
        "prim-store": { command: "prim", args: ["mcp", "--primitives", "store"] },
      },
    });
  });

  it("outputs all-primitives JSON for --agent generic with 'all'", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await runInstallCommand("all", ["install", "all", "--agent", "generic"]);

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    expect(output).toEqual({
      mcpServers: {
        prim: { command: "prim", args: ["mcp"] },
      },
    });
  });

  it("rejects unknown primitive", async () => {
    await expect(
      runInstallCommand("bogus", ["install", "bogus", "--agent", "generic"]),
    ).rejects.toThrow("Unknown primitive: bogus. Valid: wallet, store, spawn, faucet, search, email, mem, domain, token, all");
  });

  it("prints wallet warning when no default address", async () => {
    mockGetDefaultAddress.mockResolvedValue(null);
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await runInstallCommand("store", ["install", "store", "--agent", "generic"]);

    console.log = origLog;
    expect(logs.some((l) => l.includes("No wallet configured"))).toBe(true);
  });

  it("defaults to all when no primitive name given (flag in subcommand position)", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    // `prim install --agent generic` → subcommand="--agent", detectAgent manual scan finds it
    await runInstallCommand("--agent", ["install", "--agent", "generic"]);

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    expect(output.mcpServers.prim).toEqual({ command: "prim", args: ["mcp"] });
  });

  it("defaults to all when subcommand is 'all'", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await runInstallCommand("all", ["install", "all", "--agent", "generic"]);

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    expect(output.mcpServers.prim).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// runListCommand
// ---------------------------------------------------------------------------

describe("runListCommand", () => {
  it("prints message for generic agent", async () => {
    mockExistsSync.mockReturnValue(false);
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await runListCommand(["install", "--list", "--agent", "generic"]);

    console.log = origLog;
    expect(logs.some((l) => l.includes("Specify --agent"))).toBe(true);
  });

  it("prints no config when file does not exist for claude agent", async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === "/home/testuser/.claude") return true;
      return false; // mcp.json does not exist
    });
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await runListCommand(["install", "--list"]);

    console.log = origLog;
    expect(logs.some((l) => l.includes("No MCP config found"))).toBe(true);
  });

  it("lists installed prim servers", async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === "/home/testuser/.claude") return true;
      if (p === "/home/testuser/.claude/mcp.json") return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({
      mcpServers: {
        "other-tool": { command: "x" },
        prim: { command: "prim", args: ["mcp"] },
        "prim-store": { command: "prim", args: ["mcp", "--primitives", "store"] },
      },
    }));

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await runListCommand(["install", "--list"]);

    console.log = origLog;
    const output = logs.join("\n");
    expect(output).toContain("prim ");
    expect(output).toContain("prim-store");
    expect(output).not.toContain("other-tool");
  });

  it("shows no prim primitives message when none installed", async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === "/home/testuser/.claude") return true;
      if (p === "/home/testuser/.claude/mcp.json") return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({
      mcpServers: { "other-tool": { command: "x" } },
    }));

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await runListCommand(["install", "--list"]);

    console.log = origLog;
    expect(logs.some((l) => l.includes("No prim primitives installed"))).toBe(true);
  });

  it("runInstallCommand dispatches to list when subcommand is --list", async () => {
    mockExistsSync.mockReturnValue(false);
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await runInstallCommand("--list", ["install", "--list", "--agent", "generic"]);

    console.log = origLog;
    expect(logs.some((l) => l.includes("Specify --agent"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runUninstallCommand
// ---------------------------------------------------------------------------

describe("runUninstallCommand", () => {
  it("removes key from config file for claude agent", async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === "/home/testuser/.claude") return true;
      if (p === "/home/testuser/.claude/mcp.json") return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({
      mcpServers: {
        "prim-store": { command: "prim", args: ["mcp", "--primitives", "store"] },
        "other-tool": { command: "x" },
      },
    }));

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    await runUninstallCommand("store", ["uninstall", "store"]);

    console.log = origLog;
    expect(logs.some((l) => l.includes("Removed prim-store"))).toBe(true);

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1].replace(/\n$/, ""));
    expect(written.mcpServers["prim-store"]).toBeUndefined();
    expect(written.mcpServers["other-tool"]).toEqual({ command: "x" });
  });
});

// ---------------------------------------------------------------------------
// runSkillCommand
// ---------------------------------------------------------------------------

describe("runSkillCommand", () => {
  it("rejects unknown primitive", async () => {
    await expect(runSkillCommand("bogus", ["skill", "bogus"])).rejects.toThrow("Unknown primitive: bogus");
  });

  it("prints skill content when file exists", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: store\n---\n# store.prim.sh\n");

    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    await runSkillCommand("store", ["skill", "store"]);

    process.stdout.write = origWrite;
    expect(chunks.join("")).toContain("name: store");
  });
});
