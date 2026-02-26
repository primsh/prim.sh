import { readFileSync } from "node:fs";
import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "./config.ts";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

export function resolveMemUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_MEM_URL) return process.env.PRIM_MEM_URL;
  return "https://mem.prim.sh";
}

async function handleError(res: Response): Promise<never> {
  let message = `HTTP ${res.status}`;
  let code = "unknown";
  try {
    const body = (await res.json()) as { error?: { code: string; message: string } };
    if (body.error) {
      message = body.error.message;
      code = body.error.code;
    }
  } catch {
    // ignore parse error
  }
  process.stderr.write(`Error: ${message} (${code})\n`);
  process.exit(1);
}

export async function runMemCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveMemUrl(argv);
  const walletFlag = getFlag("wallet", argv);
  const passphrase = await resolvePassphrase(argv);
  const maxPaymentFlag = getFlag("max-payment", argv);
  const quiet = hasFlag("quiet", argv);
  const config = await getConfig();
  const primFetch = createPrimFetch({
    keystore:
      walletFlag !== undefined || passphrase !== undefined
        ? { address: walletFlag, passphrase }
        : true,
    maxPayment: maxPaymentFlag ?? process.env.PRIM_MAX_PAYMENT ?? "1.00",
    network: config.network,
  });

  // Handle cache subcommands
  if (sub === "cache") {
    const cacheSub = argv[2];
    switch (cacheSub) {
      case "put": {
        const namespace = argv[3];
        const key = argv[4];
        if (!namespace || !key) {
          process.stderr.write(
            "Usage: prim mem cache put NAMESPACE KEY [--value VALUE | --file PATH] [--ttl SECONDS]\n",
          );
          process.exit(1);
        }
        const valueFlag = getFlag("value", argv);
        const fileFlag = getFlag("file", argv);
        const ttlFlag = getFlag("ttl", argv);

        let value: unknown;
        if (valueFlag !== undefined) {
          try {
            value = JSON.parse(valueFlag);
          } catch {
            value = valueFlag;
          }
        } else if (fileFlag) {
          const raw = readFileSync(fileFlag, "utf-8");
          try {
            value = JSON.parse(raw);
          } catch {
            value = raw;
          }
        } else {
          process.stderr.write(
            "Usage: prim mem cache put NAMESPACE KEY [--value VALUE | --file PATH] [--ttl SECONDS]\n",
          );
          process.exit(1);
        }

        const reqBody: Record<string, unknown> = { value };
        if (ttlFlag) reqBody.ttl = Number(ttlFlag);

        const res = await primFetch(`${baseUrl}/v1/cache/${namespace}/${key}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        });
        if (!res.ok) return handleError(res);
        const data = await res.json();
        if (quiet) {
          console.log("ok");
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "get": {
        const namespace = argv[3];
        const key = argv[4];
        if (!namespace || !key) {
          process.stderr.write("Usage: prim mem cache get NAMESPACE KEY\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/cache/${namespace}/${key}`);
        if (!res.ok) return handleError(res);
        const data = (await res.json()) as { value: unknown };
        if (quiet) {
          const val = data.value;
          console.log(typeof val === "string" ? val : JSON.stringify(val));
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "rm": {
        const namespace = argv[3];
        const key = argv[4];
        if (!namespace || !key) {
          process.stderr.write("Usage: prim mem cache rm NAMESPACE KEY\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/cache/${namespace}/${key}`, {
          method: "DELETE",
        });
        if (!res.ok) return handleError(res);
        if (!quiet) {
          const data = await res.json();
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      default:
        console.log("Usage: prim mem cache <put|get|rm>");
        process.exit(1);
    }
    return;
  }

  switch (sub) {
    case "create": {
      const name = getFlag("name", argv);
      if (!name) {
        process.stderr.write("Usage: prim mem create --name NAME [--distance Cosine|Euclid|Dot] [--dimension N]\n");
        process.exit(1);
      }
      const distance = getFlag("distance", argv);
      const dimension = getFlag("dimension", argv);
      const reqBody: Record<string, unknown> = { name };
      if (distance) reqBody.distance = distance;
      if (dimension) reqBody.dimension = Number(dimension);
      const res = await primFetch(`${baseUrl}/v1/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { id: string };
      if (quiet) {
        console.log(data.id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "ls": {
      const page = getFlag("page", argv) ?? "1";
      const limit = getFlag("limit", argv) ?? "20";
      const url = new URL(`${baseUrl}/v1/collections`);
      url.searchParams.set("page", page);
      url.searchParams.set("limit", limit);
      const res = await primFetch(url.toString());
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { collections: Array<{ id: string; name: string }> };
      if (quiet) {
        for (const c of data.collections) console.log(c.id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "get": {
      const collectionId = argv[2];
      if (!collectionId) {
        process.stderr.write("Usage: prim mem get COLLECTION_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/collections/${collectionId}`);
      if (!res.ok) return handleError(res);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case "rm": {
      const collectionId = argv[2];
      if (!collectionId) {
        process.stderr.write("Usage: prim mem rm COLLECTION_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/collections/${collectionId}`, {
        method: "DELETE",
      });
      if (!res.ok) return handleError(res);
      if (!quiet) {
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "upsert": {
      const collectionId = argv[2];
      if (!collectionId) {
        process.stderr.write(
          "Usage: prim mem upsert COLLECTION_ID --text TEXT [--id DOC_ID] [--metadata JSON]\n",
        );
        process.exit(1);
      }
      const text = getFlag("text", argv);
      if (!text) {
        process.stderr.write(
          "Usage: prim mem upsert COLLECTION_ID --text TEXT [--id DOC_ID] [--metadata JSON]\n",
        );
        process.exit(1);
      }
      const docId = getFlag("id", argv);
      const metadataFlag = getFlag("metadata", argv);
      const doc: Record<string, unknown> = { text };
      if (docId) doc.id = docId;
      if (metadataFlag) {
        try {
          doc.metadata = JSON.parse(metadataFlag);
        } catch {
          process.stderr.write("Error: --metadata must be valid JSON\n");
          process.exit(1);
        }
      }
      const res = await primFetch(`${baseUrl}/v1/collections/${collectionId}/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: [doc] }),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { ids: string[] };
      if (quiet) {
        for (const id of data.ids) console.log(id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "query": {
      const collectionId = argv[2];
      if (!collectionId) {
        process.stderr.write(
          "Usage: prim mem query COLLECTION_ID --query TEXT [--limit N]\n",
        );
        process.exit(1);
      }
      const queryText = getFlag("query", argv);
      if (!queryText) {
        process.stderr.write(
          "Usage: prim mem query COLLECTION_ID --query TEXT [--limit N]\n",
        );
        process.exit(1);
      }
      const limitFlag = getFlag("limit", argv);
      const reqBody: Record<string, unknown> = { text: queryText };
      if (limitFlag) reqBody.top_k = Number(limitFlag);
      const res = await primFetch(`${baseUrl}/v1/collections/${collectionId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        matches: Array<{ id: string; score: number; text: string }>;
      };
      if (quiet) {
        for (const m of data.matches) console.log(m.id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    default:
      console.log("Usage: prim mem <create|ls|get|rm|upsert|query|cache>");
      process.exit(1);
  }
}
