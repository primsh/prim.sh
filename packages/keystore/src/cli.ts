#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import pkg from "../package.json";
import { getUsdcBalance } from "./balance.ts";
import { getDefaultAddress, setDefaultAddress } from "./config.ts";
import { decryptFromV3 } from "./crypto.ts";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";
import {
  createKey,
  exportKey,
  importKey,
  listKeys,
  loadAccount,
  loadKey,
  removeKey,
} from "./keystore.ts";
import type { KeystoreFile } from "./types.ts";

const argv = process.argv.slice(2);

async function wrapCommand(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function main() {
  if (argv[0] === "--version" || argv[0] === "-v") {
    console.log(pkg.version);
    process.exit(0);
  }

  const group = argv[0];
  const subcommand = argv[1];

  if (group === "store") {
    await wrapCommand(async () => {
      const { runStoreCommand } = await import("./store-commands.ts");
      await runStoreCommand(subcommand, argv);
    });
    return;
  }

  if (group === "spawn") {
    await wrapCommand(async () => {
      const { runSpawnCommand } = await import("./spawn-commands.ts");
      await runSpawnCommand(subcommand, argv);
    });
    return;
  }

  if (group === "email") {
    await wrapCommand(async () => {
      const { runEmailCommand } = await import("./email-commands.ts");
      await runEmailCommand(subcommand, argv);
    });
    return;
  }

  if (group === "mem") {
    await wrapCommand(async () => {
      const { runMemCommand } = await import("./mem-commands.ts");
      await runMemCommand(subcommand, argv);
    });
    return;
  }

  if (group === "domain") {
    await wrapCommand(async () => {
      const { runDomainCommand } = await import("./domain-commands.ts");
      await runDomainCommand(subcommand, argv);
    });
    return;
  }

  if (group === "token") {
    await wrapCommand(async () => {
      const { runTokenCommand } = await import("./token-commands.ts");
      await runTokenCommand(subcommand, argv);
    });
    return;
  }

  if (group === "faucet") {
    await wrapCommand(async () => {
      const { runFaucetCommand } = await import("./faucet-commands.ts");
      await runFaucetCommand(subcommand, argv);
    });
    return;
  }

  if (group === "search") {
    await wrapCommand(async () => {
      const { runSearchCommand } = await import("./search-commands.ts");
      await runSearchCommand(subcommand, argv);
    });
    return;
  }

  if (group === "mcp") {
    // Dispatch to @primsh/mcp package. Import path is resolved at runtime by Bun.
    // Using a variable import path to avoid tsc rootDir restrictions on cross-package imports.
    const mcpPath = new URL("../../mcp/src/server.ts", import.meta.url).href;
    await wrapCommand(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: cross-package dynamic import
      const mcpModule = (await import(mcpPath)) as any;
      const { startMcpServer, isPrimitive } = mcpModule;
      // mcp has no subcommand — flags start at argv[1], not argv[2].
      // Pad argv so getFlag (which scans from index 2) sees the right positions.
      const mcpArgv = ["mcp", "_", ...argv.slice(1)];
      const primitivesFlag = getFlag("primitives", mcpArgv);
      const walletFlag = getFlag("wallet", mcpArgv);
      let primitives: string[] | undefined;
      if (primitivesFlag) {
        const parsed = primitivesFlag
          .split(",")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        const invalid = parsed.filter((s: string) => !isPrimitive(s));
        if (invalid.length > 0) {
          console.error(`Error: Unknown primitives: ${invalid.join(", ")}`);
          process.exit(1);
        }
        primitives = parsed;
      }
      await startMcpServer({ primitives, walletAddress: walletFlag ?? undefined });
    });
    return;
  }

  if (group === "install") {
    await wrapCommand(async () => {
      const { runInstallCommand } = await import("./install-commands.ts");
      await runInstallCommand(subcommand, argv);
    });
    return;
  }

  if (group === "uninstall") {
    await wrapCommand(async () => {
      const { runUninstallCommand } = await import("./install-commands.ts");
      await runUninstallCommand(subcommand, argv);
    });
    return;
  }

  if (group === "skill") {
    await wrapCommand(async () => {
      const { runSkillCommand } = await import("./install-commands.ts");
      await runSkillCommand(subcommand, argv);
    });
    return;
  }

  if (group === "admin") {
    await wrapCommand(async () => {
      const { runAdminCommand } = await import("./admin-commands.ts");
      await runAdminCommand(subcommand, argv);
    });
    return;
  }

  if (group !== "wallet") {
    console.log("Usage: prim <command> <subcommand>");
    console.log("       prim --version");
    console.log("");
    console.log("  prim wallet    <create|register|list|balance|import|export|default|remove>");
    console.log("  prim store     <create-bucket|ls|put|get|rm|rm-bucket|quota>");
    console.log("  prim spawn     <create|ls|get|rm|reboot|stop|start|ssh-key>");
    console.log("  prim email     <create|ls|get|rm|renew|inbox|read|send|webhook|domain>");
    console.log("  prim mem       <create|ls|get|rm|upsert|query|cache>");
    console.log("  prim domain    <search|quote|register|recover|status|ns|zone|record>");
    console.log("  prim token     <deploy|ls|get|mint|supply|pool>");
    console.log("  prim faucet    <usdc|eth|status>");
    console.log("  prim search    <web|news|extract>");
    console.log("  prim mcp       [--primitives wallet,store,...] [--wallet 0x...]");
    console.log("  prim admin     <list-requests|approve|deny|add-wallet|remove-wallet>");
    console.log("  prim install   <primitive|all> [--agent claude|cursor|generic]");
    console.log("  prim uninstall <primitive|all>");
    console.log("  prim skill     <primitive|onboard>");
    process.exit(1);
  }

  await wrapCommand(async () => {
    switch (subcommand) {
      case "create": {
        const label = getFlag("label", argv);
        const passphrase = await resolvePassphrase(argv);
        const { address } = await createKey({ label, passphrase });
        console.log(`Created wallet: ${address}`);
        const defaultAddr = await getDefaultAddress();
        if (defaultAddr === address) {
          console.log("Set as default wallet.");
        }
        break;
      }

      case "list": {
        const keys = await listKeys();
        if (keys.length === 0) {
          console.log("No keys found. Run: prim wallet create");
          break;
        }
        console.log(`${"ADDRESS".padEnd(44)} ${"LABEL".padEnd(20)} DEFAULT`);
        for (const k of keys) {
          const label = k.label ?? "—";
          const def = k.isDefault ? "*" : "";
          console.log(`${k.address.padEnd(44)} ${label.padEnd(20)} ${def}`);
        }
        break;
      }

      case "balance": {
        // prim wallet balance [address] — optional address, defaults to default wallet
        const address = argv[2];
        let resolvedAddress: string;
        if (address) {
          resolvedAddress = address;
        } else {
          // Load the key to resolve the default address (throws if none configured)
          const key = await loadKey();
          const { privateKeyToAccount } = await import("viem/accounts");
          resolvedAddress = privateKeyToAccount(key).address;
        }
        const { balance, funded, network } = await getUsdcBalance(resolvedAddress);
        console.log(
          `${resolvedAddress}  ${balance} USDC  [${network}]${funded ? "" : "  (unfunded)"}`,
        );
        break;
      }

      case "import": {
        const keyArg = argv[2];
        if (!keyArg) {
          console.error(
            "Usage: prim wallet import <0xKEY|file.json> [--label NAME] [--passphrase]",
          );
          process.exit(1);
        }
        const label = getFlag("label", argv);
        const passphrase = await resolvePassphrase(argv);

        let privateKey: `0x${string}`;
        if (keyArg.endsWith(".json") && existsSync(keyArg)) {
          // Import from V3 keystore file (geth/foundry/MetaMask)
          if (!passphrase) {
            console.error("Passphrase required to decrypt a V3 keystore file.");
            process.exit(1);
          }
          const keystoreFile = JSON.parse(readFileSync(keyArg, "utf-8")) as KeystoreFile;
          privateKey = decryptFromV3(keystoreFile.crypto, passphrase);
        } else {
          privateKey = keyArg as `0x${string}`;
        }

        const { address } = await importKey(privateKey, { label, passphrase });
        console.log(`Imported wallet: ${address}`);
        break;
      }

      case "export": {
        const address = argv[2];
        if (!address) {
          console.error("Usage: prim wallet export <address> [--passphrase]");
          process.exit(1);
        }
        const passphrase = await resolvePassphrase(argv);
        console.warn("⚠ WARNING: Private key will be displayed in plaintext.");
        const key = await exportKey(address, { passphrase });
        console.log(key);
        break;
      }

      case "default": {
        const address = argv[2];
        if (!address) {
          const current = await getDefaultAddress();
          console.log(current ?? "No default wallet set.");
          break;
        }
        await setDefaultAddress(address);
        console.log(`Default wallet set to ${address}`);
        break;
      }

      case "remove": {
        const address = argv[2];
        if (!address) {
          console.error("Usage: prim wallet remove <address>");
          process.exit(1);
        }
        await removeKey(address);
        console.log(`⚠ Removed key for ${address}. This cannot be undone.`);
        break;
      }

      case "register": {
        // EIP-191 registration with wallet.prim.sh
        const walletUrl =
          getFlag("url", argv) ?? process.env.PRIM_WALLET_URL ?? "https://wallet.prim.sh";
        const passphrase = await resolvePassphrase(argv);
        const account = await loadAccount(undefined, { passphrase });
        const address = account.address;
        const timestamp = new Date().toISOString();
        const message = `Register ${address} with prim.sh at ${timestamp}`;
        const signature = await account.signMessage({ message });
        const res = await fetch(`${walletUrl}/v1/wallets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, signature, timestamp }),
        });
        if (res.status === 409) {
          console.log(`Already registered: ${address}`);
          break;
        }
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        console.log(`Registered: ${address}`);
        break;
      }

      default:
        console.log(
          "Usage: prim wallet <create|register|list|balance|import|export|default|remove>",
        );
        process.exit(1);
    }
  });
}

main();
