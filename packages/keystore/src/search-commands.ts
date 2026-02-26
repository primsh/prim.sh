import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "./config.ts";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

export function resolveSearchUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_SEARCH_URL) return process.env.PRIM_SEARCH_URL;
  return "https://search.prim.sh";
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

/**
 * Collect all positional args after argv[1] (subcommand) that are not flags.
 * argv[0] = group, argv[1] = subcommand, argv[2]+ = args/flags.
 */
function collectQuery(argv: string[]): string {
  const parts: string[] = [];
  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      // Skip flag and its value if next token is not a flag
      if (!arg.includes("=") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        i += 2;
      } else {
        i += 1;
      }
    } else {
      parts.push(arg);
      i += 1;
    }
  }
  return parts.join(" ");
}

function printSearchResults(data: {
  answer?: string;
  results: Array<{ title: string; url: string; content: string; score: number }>;
}): void {
  if (data.answer) {
    console.log(`Answer: ${data.answer}`);
    console.log("");
  }
  if (data.results.length === 0) {
    console.log("No results.");
    return;
  }
  for (let i = 0; i < data.results.length; i++) {
    const r = data.results[i];
    console.log(`[${i + 1}] ${r.title} (${r.score.toFixed(2)})`);
    console.log(`    ${r.url}`);
    console.log(`    ${r.content}`);
    if (i < data.results.length - 1) console.log("");
  }
}

export async function runSearchCommand(sub: string, argv: string[]): Promise<void> {
  if (!sub || sub === "--help" || sub === "-h") {
    console.log("Usage: prim search <web|news|extract> [args] [flags]");
    console.log("");
    console.log("  prim search web <query> [--max-results N] [--depth basic|advanced]");
    console.log("                          [--country XX] [--time-range day|week|month|year]");
    console.log("                          [--include-answer]");
    console.log("  prim search news <query> [--max-results N] [--country XX]");
    console.log("                           [--time-range day|week|month|year]");
    console.log("  prim search extract <url> [--format markdown|text]");
    process.exit(1);
  }

  const baseUrl = resolveSearchUrl(argv);
  const walletFlag = getFlag("wallet", argv);
  const passphrase = await resolvePassphrase(argv);
  const maxPaymentFlag = getFlag("max-payment", argv);
  const config = await getConfig();
  const primFetch = createPrimFetch({
    keystore:
      walletFlag !== undefined || passphrase !== undefined
        ? { address: walletFlag, passphrase }
        : true,
    maxPayment: maxPaymentFlag ?? process.env.PRIM_MAX_PAYMENT ?? "1.00",
    network: config.network,
  });

  switch (sub) {
    case "web": {
      const query = collectQuery(argv);
      if (!query) {
        process.stderr.write(
          "Usage: prim search web <query> [--max-results N] [--depth basic|advanced] [--country XX] [--time-range day|week|month|year] [--include-answer]\n",
        );
        process.exit(1);
      }
      const maxResults = getFlag("max-results", argv);
      const depth = getFlag("depth", argv);
      const country = getFlag("country", argv);
      const timeRange = getFlag("time-range", argv);
      const includeAnswer = hasFlag("include-answer", argv);

      const reqBody: Record<string, unknown> = { query };
      if (maxResults) reqBody.max_results = Number(maxResults);
      if (depth) reqBody.search_depth = depth;
      if (country) reqBody.country = country;
      if (timeRange) reqBody.time_range = timeRange;
      if (includeAnswer) reqBody.include_answer = true;

      const res = await primFetch(`${baseUrl}/v1/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        query: string;
        answer?: string;
        results: Array<{ title: string; url: string; content: string; score: number }>;
        response_time: number;
      };
      printSearchResults(data);
      break;
    }

    case "news": {
      const query = collectQuery(argv);
      if (!query) {
        process.stderr.write(
          "Usage: prim search news <query> [--max-results N] [--country XX] [--time-range day|week|month|year]\n",
        );
        process.exit(1);
      }
      const maxResults = getFlag("max-results", argv);
      const country = getFlag("country", argv);
      const timeRange = getFlag("time-range", argv);
      const includeAnswer = hasFlag("include-answer", argv);

      const reqBody: Record<string, unknown> = { query };
      if (maxResults) reqBody.max_results = Number(maxResults);
      if (country) reqBody.country = country;
      if (timeRange) reqBody.time_range = timeRange;
      if (includeAnswer) reqBody.include_answer = true;

      const res = await primFetch(`${baseUrl}/v1/search/news`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        query: string;
        answer?: string;
        results: Array<{ title: string; url: string; content: string; score: number }>;
        response_time: number;
      };
      printSearchResults(data);
      break;
    }

    case "extract": {
      const urlArg = argv[2];
      if (!urlArg || urlArg.startsWith("--")) {
        process.stderr.write(
          "Usage: prim search extract <url[,url,...]> [--format markdown|text]\n",
        );
        process.exit(1);
      }
      const format = getFlag("format", argv) ?? "markdown";
      const urls = urlArg.includes(",") ? urlArg.split(",").map((u) => u.trim()) : urlArg;

      const res = await primFetch(`${baseUrl}/v1/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, format }),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        results: Array<{ url: string; content: string }>;
        failed: Array<{ url: string; error: string }>;
        response_time: number;
      };
      if (data.results.length === 0 && data.failed.length === 0) {
        console.log("No results.");
        break;
      }
      const multiUrl = data.results.length + data.failed.length > 1;
      for (const r of data.results) {
        if (multiUrl) {
          console.log(`=== ${r.url} ===`);
          console.log("");
        }
        console.log(r.content);
        if (multiUrl) console.log("");
      }
      for (const f of data.failed) {
        process.stderr.write(`Failed to extract ${f.url}: ${f.error}\n`);
      }
      break;
    }

    default:
      console.log("Usage: prim search <web|news|extract>");
      process.exit(1);
  }
}
