import { readFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { createPrimFetch } from "@prim/x402-client";
import { getConfig } from "./config.ts";

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

function getFlag(name: string, argv: string[]): string | undefined {
  for (const arg of argv) {
    if (arg.startsWith(`--${name}=`)) return arg.slice(`--${name}=`.length);
    if (arg === `--${name}`) return "";
  }
  return undefined;
}

function hasFlag(name: string, argv: string[]): boolean {
  return argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
}

export function resolveStoreUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_STORE_URL) return process.env.PRIM_STORE_URL;
  return "https://store.prim.sh";
}

function inferContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".json": "application/json",
    ".html": "text/html",
    ".htm": "text/html",
    ".xml": "application/xml",
    ".csv": "text/csv",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".js": "application/javascript",
    ".ts": "application/typescript",
    ".css": "text/css",
    ".zip": "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
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

export async function runStoreCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveStoreUrl(argv);
  const walletFlag = getFlag("wallet", argv);
  const passphraseFlag = getFlag("passphrase", argv);
  const maxPaymentFlag = getFlag("max-payment", argv);
  const quiet = hasFlag("quiet", argv);
  const config = await getConfig();
  const primFetch = createPrimFetch({
    keystore: walletFlag ? { address: walletFlag, passphrase: passphraseFlag } : true,
    maxPayment: maxPaymentFlag ?? "1.00",
    network: config.network,
  });

  switch (sub) {
    case "create-bucket": {
      const name = getFlag("name", argv);
      if (!name) {
        process.stderr.write("Usage: prim store create-bucket --name NAME [--location HINT]\n");
        process.exit(1);
      }
      const location = getFlag("location", argv);
      const reqBody: Record<string, string> = { name };
      if (location) reqBody.location = location;
      const res = await primFetch(`${baseUrl}/v1/buckets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { bucket: { id: string } };
      if (quiet) {
        console.log(data.bucket.id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "ls": {
      const page = getFlag("page", argv) ?? "1";
      const perPage = getFlag("per-page", argv) ?? "20";
      const url = new URL(`${baseUrl}/v1/buckets`);
      url.searchParams.set("page", page);
      url.searchParams.set("per_page", perPage);
      const res = await primFetch(url.toString());
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { buckets: Array<{ id: string }> };
      if (quiet) {
        for (const b of data.buckets) console.log(b.id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "put": {
      const bucketId = argv[2];
      const key = argv[3];
      if (!bucketId || !key) {
        process.stderr.write("Usage: prim store put BUCKET_ID KEY [--file=PATH | stdin]\n");
        process.exit(1);
      }
      const filePath = getFlag("file", argv);
      const contentTypeFlag = getFlag("content-type", argv);
      let body: Uint8Array;
      let contentLength: number;
      let contentType: string;
      if (filePath) {
        const stats = statSync(filePath);
        contentLength = stats.size;
        contentType = contentTypeFlag ?? inferContentType(filePath);
        body = new Uint8Array(readFileSync(filePath) as Buffer);
      } else {
        if (process.stdin.isTTY) {
          process.stderr.write("Error: Provide --file=PATH or pipe data via stdin\n");
          process.exit(1);
        }
        const buf = await readStdin();
        body = new Uint8Array(buf);
        contentLength = body.length;
        contentType = contentTypeFlag ?? "application/octet-stream";
      }
      const res = await primFetch(`${baseUrl}/v1/buckets/${bucketId}/objects/${key}`, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(contentLength),
        },
        body: body as BodyInit,
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { key: string };
      if (quiet) {
        console.log(data.key);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "get": {
      const bucketId = argv[2];
      const key = argv[3];
      if (!bucketId || !key) {
        process.stderr.write("Usage: prim store get BUCKET_ID KEY [--out=PATH | stdout]\n");
        process.exit(1);
      }
      const outPath = getFlag("out", argv);
      const res = await primFetch(`${baseUrl}/v1/buckets/${bucketId}/objects/${key}`);
      if (!res.ok) return handleError(res);
      const buf = Buffer.from(await res.arrayBuffer());
      if (outPath) {
        await writeFile(outPath, buf);
      } else {
        process.stdout.write(buf);
      }
      break;
    }

    case "rm": {
      const bucketId = argv[2];
      const key = argv[3];
      if (!bucketId || !key) {
        process.stderr.write("Usage: prim store rm BUCKET_ID KEY\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/buckets/${bucketId}/objects/${key}`, {
        method: "DELETE",
      });
      if (!res.ok) return handleError(res);
      if (!quiet) {
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "rm-bucket": {
      const bucketId = argv[2];
      if (!bucketId) {
        process.stderr.write("Usage: prim store rm-bucket BUCKET_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/buckets/${bucketId}`, {
        method: "DELETE",
      });
      if (!res.ok) return handleError(res);
      if (!quiet) {
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "quota": {
      const bucketId = argv[2];
      if (!bucketId) {
        process.stderr.write("Usage: prim store quota BUCKET_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/buckets/${bucketId}/quota`);
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { usage_bytes: number };
      if (quiet) {
        console.log(data.usage_bytes);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    default:
      console.log("Usage: prim store <create-bucket|ls|put|get|rm|rm-bucket|quota>");
      process.exit(1);
  }
}
