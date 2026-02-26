#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { createKey, importKey, listKeys, exportKey, removeKey, loadKey } from "./keystore.ts";
import { getDefaultAddress, setDefaultAddress } from "./config.ts";
import { getUsdcBalance } from "./balance.ts";
import { decryptFromV3 } from "./crypto.ts";
import type { KeystoreFile } from "./types.ts";
import { getFlag, hasFlag } from "./flags.ts";
import pkg from "../package.json";

const argv = process.argv.slice(2);

async function promptPassphrase(prompt = "Passphrase: "): Promise<string> {
  const rl = createInterface({ input, output });
  const result = await rl.question(prompt);
  rl.close();
  return result;
}

/** Returns the passphrase if --passphrase flag is present, undefined otherwise. */
async function resolvePassphrase(): Promise<string | undefined> {
  if (!hasFlag("passphrase", argv)) return undefined;
  const value = getFlag("passphrase", argv);
  if (value) return value; // --passphrase=VALUE
  return promptPassphrase(); // --passphrase (interactive)
}

async function main() {
  if (argv[0] === "--version" || argv[0] === "-v") {
    console.log(pkg.version);
    process.exit(0);
  }

  const group = argv[0];
  const subcommand = argv[1];

  if (group === "store") {
    try {
      const { runStoreCommand } = await import("./store-commands.ts");
      await runStoreCommand(subcommand, argv);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    return;
  }

  if (group === "spawn") {
    try {
      const { runSpawnCommand } = await import("./spawn-commands.ts");
      await runSpawnCommand(subcommand, argv);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    return;
  }

  if (group === "faucet") {
    try {
      const { runFaucetCommand } = await import("./faucet-commands.ts");
      await runFaucetCommand(subcommand, argv);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    return;
  }

  if (group === "admin") {
    try {
      const { runAdminCommand } = await import("./admin-commands.ts");
      await runAdminCommand(subcommand, argv);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    return;
  }

  if (group !== "wallet") {
    console.log("Usage: prim <wallet|store|spawn|faucet|admin> <subcommand>");
    console.log("       prim --version");
    console.log("");
    console.log("  prim wallet <create|list|balance|import|export|default|remove>");
    console.log("  prim store  <create-bucket|ls|put|get|rm|rm-bucket|quota>");
    console.log("  prim spawn  <create|ls|get|rm|reboot|stop|start|ssh-key>");
    console.log("  prim faucet <usdc|eth|status>");
    console.log("  prim admin  <list-requests|approve|deny|add-wallet|remove-wallet>");
    process.exit(1);
  }

  try {
    switch (subcommand) {
      case "create": {
        const label = getFlag("label", argv);
        const passphrase = await resolvePassphrase();
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
        const passphrase = await resolvePassphrase();

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
        const passphrase = await resolvePassphrase();
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

      default:
        console.log("Usage: prim wallet <create|list|balance|import|export|default|remove>");
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
