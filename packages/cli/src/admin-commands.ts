import { getConfig } from "@primsh/keystore";
import { getFlag } from "./flags.ts";

function resolveAdminKey(): string {
  const key = process.env.PRIM_ADMIN_KEY;
  if (!key) {
    process.stderr.write("Error: PRIM_ADMIN_KEY not set\n");
    process.exit(1);
  }
  return key;
}

function resolveApiUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_API_URL) return process.env.PRIM_API_URL;
  return "https://prim.sh";
}

function resolveWalletUrl(argv: string[]): string {
  const flag = getFlag("wallet-url", argv);
  if (flag) return flag;
  if (process.env.PRIM_WALLET_URL) return process.env.PRIM_WALLET_URL;
  return "https://wallet.prim.sh";
}

async function handleError(res: Response): Promise<never> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string | { message: string } };
    if (body.error) {
      message = typeof body.error === "string" ? body.error : body.error.message;
    }
  } catch {
    // ignore parse error
  }
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

export async function runAdminCommand(sub: string, argv: string[]): Promise<void> {
  const adminKey = resolveAdminKey();
  const apiUrl = resolveApiUrl(argv);
  const walletUrl = resolveWalletUrl(argv);
  const internalKey = process.env.PRIM_INTERNAL_KEY ?? adminKey;

  switch (sub) {
    case "list-requests": {
      const status = getFlag("status", argv) || "pending";
      const res = await fetch(`${apiUrl}/access/requests?status=${status}`, {
        headers: { "X-Admin-Key": adminKey },
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { requests: Array<Record<string, unknown>> };
      if (data.requests.length === 0) {
        console.log("No requests found.");
        return;
      }
      console.log(`${"ID".padEnd(10)} ${"WALLET".padEnd(44)} ${"STATUS".padEnd(10)} CREATED`);
      for (const r of data.requests) {
        console.log(
          `${String(r.id).padEnd(10)} ${String(r.wallet).padEnd(44)} ${String(r.status).padEnd(10)} ${String(r.created_at)}`,
        );
      }
      break;
    }

    case "approve": {
      const requestId = argv[2];
      if (!requestId) {
        process.stderr.write("Usage: prim admin approve REQUEST_ID\n");
        process.exit(1);
      }
      const res = await fetch(`${apiUrl}/access/requests/${requestId}/approve`, {
        method: "POST",
        headers: { "X-Admin-Key": adminKey },
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { id: string; status: string; wallet: string };
      console.log(`Approved: ${data.wallet}`);
      break;
    }

    case "deny": {
      const requestId = argv[2];
      if (!requestId) {
        process.stderr.write("Usage: prim admin deny REQUEST_ID [--reason TEXT]\n");
        process.exit(1);
      }
      const reason = getFlag("reason", argv);
      const res = await fetch(`${apiUrl}/access/requests/${requestId}/deny`, {
        method: "POST",
        headers: {
          "X-Admin-Key": adminKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (!res.ok) return handleError(res);
      console.log(`Denied request ${requestId}`);
      break;
    }

    case "add-wallet": {
      const address = argv[2];
      if (!address) {
        process.stderr.write("Usage: prim admin add-wallet ADDRESS [--note TEXT]\n");
        process.exit(1);
      }
      const note = getFlag("note", argv);
      const res = await fetch(`${walletUrl}/internal/allowlist/add`, {
        method: "POST",
        headers: {
          "X-Internal-Key": internalKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address,
          added_by: "admin-cli",
          note: note || undefined,
        }),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { address: string };
      console.log(`Added to allowlist: ${data.address}`);
      break;
    }

    case "remove-wallet": {
      const address = argv[2];
      if (!address) {
        process.stderr.write("Usage: prim admin remove-wallet ADDRESS\n");
        process.exit(1);
      }
      const res = await fetch(`${walletUrl}/internal/allowlist/${address}`, {
        method: "DELETE",
        headers: { "X-Internal-Key": internalKey },
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { address: string };
      console.log(`Removed from allowlist: ${data.address}`);
      break;
    }

    default:
      console.log("Usage: prim admin <list-requests|approve|deny|add-wallet|remove-wallet>");
      process.exit(1);
  }
}
