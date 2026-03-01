// SPDX-License-Identifier: Apache-2.0
import { ProviderError } from "./provider.ts";
import type { ImagineProvider, ImagineProviderData } from "./provider.ts";

export class GoogleGeminiClient implements ImagineProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _client: GoogleGeminiClient | undefined;
let _clientKey: string | undefined;

export function resetClient(): void {
  _client = undefined;
  _clientKey = undefined;
}

export function getClient(): GoogleGeminiClient {
  const key = process.env.IMAGINE_API_KEY;
  if (!key) throw new ProviderError("IMAGINE_API_KEY is not configured", "provider_error");
  if (!_client || _clientKey !== key) {
    _client = new GoogleGeminiClient(key);
    _clientKey = key;
  }
  return _client;
}
