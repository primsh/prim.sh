// SPDX-License-Identifier: Apache-2.0
// When adding a new prim: import its factory + add to the return object.
// NOTE: Subpath exports use .ts extensions (Bun workspace). I-52 (npm publish) will need to
// transform these to .js for Node.js compatibility.

import { createPrimFetch } from "@primsh/x402-client";
import type { CreatePrimFetchConfig } from "@primsh/x402-client";
import { createCreateClient } from "./create.ts";
import { createDomainClient } from "./domain.ts";
import { createEmailClient } from "./email.ts";
import { createFaucetClient } from "./faucet.ts";
import { createGateClient } from "./gate.ts";
import { createImagineClient } from "./imagine.ts";
import { createInferClient } from "./infer.ts";
import { createMemClient } from "./mem.ts";
import { createSearchClient } from "./search.ts";
import { createSpawnClient } from "./spawn.ts";
import { createStoreClient } from "./store.ts";
import { createTokenClient } from "./token.ts";
import { createTrackClient } from "./track.ts";
import { createWalletClient } from "./wallet.ts";

/** Configuration for createPrimClient(). Passes through all CreatePrimFetchConfig fields. */
export type PrimClientConfig = CreatePrimFetchConfig;

/** Creates a unified client with namespaced access to all Prim primitives. */
export function createPrimClient(config: PrimClientConfig) {
  const primFetch = createPrimFetch(config);
  return {
    wallet: createWalletClient(primFetch),
    store: createStoreClient(primFetch),
    search: createSearchClient(primFetch),
    spawn: createSpawnClient(primFetch),
    email: createEmailClient(primFetch),
    token: createTokenClient(primFetch),
    mem: createMemClient(primFetch),
    domain: createDomainClient(primFetch),
    track: createTrackClient(primFetch),
    infer: createInferClient(primFetch),
    create: createCreateClient(primFetch),
    imagine: createImagineClient(primFetch),
    faucet: createFaucetClient(primFetch),
    gate: createGateClient(primFetch),
  };
}
