/**
 * EmbeddingProvider interface + Google Gemini implementation.
 * Provider absorbs embedding cost (Prim's GOOGLE_API_KEY).
 */

export interface EmbeddingProvider {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  dimensions: number;
  model: string;
}

export class EmbeddingError extends Error {
  code: string;

  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
    this.code = "embedding_error";
  }
}

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  dimensions: number;
  model: string;

  constructor() {
    this.model = process.env.EMBEDDING_MODEL ?? "gemini-embedding-001";
    this.dimensions = Number(process.env.EMBEDDING_DIMENSIONS ?? "768");
  }

  private get apiKey(): string {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new EmbeddingError("GOOGLE_API_KEY not set");
    return key;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this._batchEmbed(texts, "RETRIEVAL_DOCUMENT");
  }

  async embedQuery(text: string): Promise<number[]> {
    const results = await this._batchEmbed([text], "RETRIEVAL_QUERY");
    return results[0];
  }

  private async _batchEmbed(texts: string[], taskType: string): Promise<number[][]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;

    const body = {
      requests: texts.map((text) => ({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: this.dimensions,
      })),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new EmbeddingError(`Google embedding API error ${res.status}: ${text}`);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new EmbeddingError("Malformed embedding response: invalid JSON");
    }

    if (
      !data ||
      typeof data !== "object" ||
      !("embeddings" in data) ||
      !Array.isArray((data as { embeddings: unknown }).embeddings)
    ) {
      throw new EmbeddingError("Malformed embedding response: missing embeddings array");
    }

    const embeddings = (data as { embeddings: Array<{ values: number[] }> }).embeddings;
    return embeddings.map((e, i) => {
      if (!e || !Array.isArray(e.values)) {
        throw new EmbeddingError(`Malformed embedding response: missing values at index ${i}`);
      }
      return e.values;
    });
  }
}

let _provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (_provider) return _provider;
  const type = process.env.EMBEDDING_PROVIDER ?? "google";
  if (type === "google") {
    _provider = new GoogleEmbeddingProvider();
  } else {
    throw new Error(`Unknown embedding provider: ${type}`);
  }
  return _provider;
}

export function resetEmbeddingProvider(): void {
  _provider = null;
}
