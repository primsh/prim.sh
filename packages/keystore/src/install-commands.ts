import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { getFlag } from "./flags.ts";
import { getDefaultAddress } from "./config.ts";
import { SKILL_CONTENT } from "./skill-content.ts";

const PRIMITIVES = ["wallet", "store", "spawn", "faucet", "search"] as const;
type Primitive = (typeof PRIMITIVES)[number];

/** Which primitives require wallet to be installed alongside them. */
const REQUIRES_WALLET: ReadonlySet<string> = new Set(["store", "spawn", "search"]);

// ---------------------------------------------------------------------------
// Agent detection
// ---------------------------------------------------------------------------

export type AgentEnv = "claude" | "cursor" | "generic";

export function detectAgent(argv: string[]): AgentEnv {
  // getFlag starts at index 2 (skips group + subcommand). But `prim install --agent generic`
  // puts --agent at index 1 (subcommand position). Check both via getFlag and manual scan.
  let override = getFlag("agent", argv);
  if (!override) {
    for (let i = 1; i < argv.length; i++) {
      if (argv[i].startsWith("--agent=")) { override = argv[i].slice("--agent=".length); break; }
      if (argv[i] === "--agent" && i + 1 < argv.length && !argv[i + 1].startsWith("--")) { override = argv[i + 1]; break; }
    }
  }
  if (override === "claude" || override === "cursor" || override === "generic") return override;

  if (existsSync(join(homedir(), ".claude"))) return "claude";

  // Walk up from cwd looking for .cursor/ (max 5 levels)
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, ".cursor"))) return "cursor";
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return "generic";
}

function getConfigPath(agent: AgentEnv): string | null {
  switch (agent) {
    case "claude":
      return join(homedir(), ".claude", "mcp.json");
    case "cursor": {
      // Walk up from cwd looking for .cursor/
      let dir = process.cwd();
      for (let i = 0; i < 5; i++) {
        const candidate = join(dir, ".cursor", "mcp.json");
        if (existsSync(join(dir, ".cursor"))) return candidate;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      return join(process.cwd(), ".cursor", "mcp.json");
    }
    case "generic":
      return null;
  }
}

// ---------------------------------------------------------------------------
// MCP config generation
// ---------------------------------------------------------------------------

export function generateMcpConfig(primitives: string[]): Record<string, unknown> {
  if (primitives.length === PRIMITIVES.length) {
    // All primitives
    return {
      mcpServers: {
        prim: { command: "prim", args: ["mcp"] },
      },
    };
  }
  const servers: Record<string, unknown> = {};
  for (const p of primitives) {
    servers[`prim-${p}`] = { command: "prim", args: ["mcp", "--primitives", p] };
  }
  return { mcpServers: servers };
}

// ---------------------------------------------------------------------------
// Config file merge / remove
// ---------------------------------------------------------------------------

export function mergeIntoConfigFile(configPath: string, mcpConfig: Record<string, unknown>): void {
  let existing: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    try {
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`Cannot parse ${configPath} as JSON. Fix the file manually or remove it.`);
    }
  } else {
    mkdirSync(dirname(configPath), { recursive: true });
  }

  if (!existing.mcpServers || typeof existing.mcpServers !== "object") {
    existing.mcpServers = {};
  }

  const newServers = (mcpConfig as { mcpServers: Record<string, unknown> }).mcpServers;
  const existingServers = existing.mcpServers as Record<string, unknown>;
  for (const [key, value] of Object.entries(newServers)) {
    existingServers[key] = value;
  }

  writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
}

export function removeFromConfigFile(configPath: string, primitives: string[]): void {
  if (!existsSync(configPath)) {
    throw new Error(`${configPath} does not exist.`);
  }

  const raw = readFileSync(configPath, "utf-8");
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Cannot parse ${configPath} as JSON. Fix the file manually.`);
  }

  if (!config.mcpServers || typeof config.mcpServers !== "object") return;

  const servers = config.mcpServers as Record<string, unknown>;
  const isAll = primitives.length === PRIMITIVES.length;

  if (isAll) {
    // Remove all prim-prefixed keys and the "prim" key
    for (const key of Object.keys(servers)) {
      if (key === "prim" || key.startsWith("prim-")) {
        delete servers[key];
      }
    }
  } else {
    for (const p of primitives) {
      delete servers[`prim-${p}`];
    }
    // Also remove unified "prim" key if it exists and we're uninstalling specific primitives
    // (don't remove it — user may have installed "all" separately)
  }

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

// ---------------------------------------------------------------------------
// Skill helpers
// ---------------------------------------------------------------------------

function getSkillContent(primitive: string): string | null {
  // In dev mode, try reading from the skills/ directory on disk
  const candidates = [
    join(dirname(new URL(import.meta.url).pathname), "..", "..", "..", "skills", `${primitive}.md`),
    join(dirname(new URL(import.meta.url).pathname), "..", "skills", `${primitive}.md`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  // Fall back to embedded content (works in compiled binary)
  return SKILL_CONTENT[primitive] ?? null;
}

// ---------------------------------------------------------------------------
// Validate primitive name
// ---------------------------------------------------------------------------

function parsePrimitives(name: string | undefined): string[] {
  // If no name or "all" or a flag leaked into subcommand position, install all
  if (!name || name === "all" || name.startsWith("--")) return [...PRIMITIVES];
  if (!(PRIMITIVES as readonly string[]).includes(name)) {
    throw new Error(`Unknown primitive: ${name}. Valid: ${[...PRIMITIVES, "all"].join(", ")}`);
  }
  return [name];
}

// ---------------------------------------------------------------------------
// Install command
// ---------------------------------------------------------------------------

export async function runInstallCommand(subcommand: string | undefined, argv: string[]): Promise<void> {
  const primitives = parsePrimitives(subcommand);
  const isAll = primitives.length === PRIMITIVES.length;
  const agent = detectAgent(argv);

  // Wallet check (advisory)
  const defaultAddr = await getDefaultAddress();
  if (!defaultAddr) {
    console.log(
      "Warning: No wallet configured. Run `prim wallet create` first.\n" +
        "MCP tools that require payment will fail without a wallet.\n",
    );
  }

  const mcpConfig = generateMcpConfig(primitives);

  if (agent === "generic") {
    // Machine-readable output only
    console.log(JSON.stringify(mcpConfig, null, 2));
    return;
  }

  const configPath = getConfigPath(agent);
  if (!configPath) return; // shouldn't happen for claude/cursor

  const agentLabel = agent === "claude" ? "Claude Code" : "Cursor";
  console.log(`Detected: ${agentLabel} (${configPath})\n`);

  mergeIntoConfigFile(configPath, mcpConfig);

  const keyName = isAll ? "prim (all primitives)" : `prim-${primitives[0]}`;
  console.log(`Added ${keyName} to ${configPath}\n`);

  // Dependency advisory
  if (!isAll) {
    for (const p of primitives) {
      if (REQUIRES_WALLET.has(p) && p !== "wallet") {
        // Check if prim-wallet or prim (all) is already installed
        if (existsSync(configPath)) {
          try {
            const raw = readFileSync(configPath, "utf-8");
            const config = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
            const servers = config.mcpServers ?? {};
            if (!servers["prim-wallet"] && !servers.prim) {
              console.log(
                `Note: ${p} requires wallet. Run \`prim install wallet\` to add wallet tools too, or \`prim install all\` for everything.\n`,
              );
            }
          } catch {
            // Ignore — we just wrote it, should be fine
          }
        }
      }
    }
  }

  // Skill instructions
  if (isAll) {
    console.log(`Skills: ${primitives.join(", ")}`);
    console.log("  To load skills, add them to your agent's instructions.");
    console.log("  Run `prim skill <name>` to print any skill.\n");
  } else {
    console.log(`Skill: ${primitives[0]}.prim.sh`);
    console.log("  To load the skill, add this to your agent's instructions:");
    console.log(`  Run \`prim skill ${primitives[0]}\` to print the skill content.\n`);
  }

  console.log(`Restart ${agentLabel} to load the MCP server.`);
}

// ---------------------------------------------------------------------------
// Uninstall command
// ---------------------------------------------------------------------------

export async function runUninstallCommand(subcommand: string | undefined, argv: string[]): Promise<void> {
  const primitives = parsePrimitives(subcommand);
  const isAll = primitives.length === PRIMITIVES.length;
  const agent = detectAgent(argv);

  if (agent === "generic") {
    console.log("Nothing to uninstall for generic agent (no config file managed).");
    return;
  }

  const configPath = getConfigPath(agent);
  if (!configPath) return;

  const agentLabel = agent === "claude" ? "Claude Code" : "Cursor";

  removeFromConfigFile(configPath, primitives);

  const keyName = isAll ? "all prim entries" : `prim-${primitives[0]}`;
  console.log(`Removed ${keyName} from ${configPath}`);
  console.log(`Restart ${agentLabel} to unload the MCP server.`);
}

// ---------------------------------------------------------------------------
// Skill command (bonus: `prim skill <name>`)
// ---------------------------------------------------------------------------

export async function runSkillCommand(subcommand: string | undefined, _argv: string[]): Promise<void> {
  if (!subcommand) {
    console.log(`Usage: prim skill <name>\nAvailable: ${PRIMITIVES.join(", ")}`);
    return;
  }

  if (!(PRIMITIVES as readonly string[]).includes(subcommand)) {
    throw new Error(`Unknown primitive: ${subcommand}. Valid: ${PRIMITIVES.join(", ")}`);
  }

  const content = getSkillContent(subcommand);
  if (!content) {
    throw new Error(`Skill file not found for ${subcommand}. Skills may not be bundled in this build.`);
  }
  process.stdout.write(content);
}
