// SPDX-License-Identifier: Apache-2.0
// When adding a new prim: import its factory + add to the return object.
// NOTE: Subpath exports use .ts extensions (Bun workspace). I-52 (npm publish) will need to
// transform these to .js for Node.js compatibility.

import { createPrimFetch } from "@primsh/x402-client";
import type { CreatePrimFetchConfig } from "@primsh/x402-client";
import { createCreateClient } from "../generated/create.ts";
import { createDomainClient } from "../generated/domain.ts";
import { createEmailClient } from "../generated/email.ts";
import { createFaucetClient } from "../generated/faucet.ts";
import { createGateClient } from "../generated/gate.ts";
import { createImagineClient } from "../generated/imagine.ts";
import { createInferClient } from "../generated/infer.ts";
import { createMemClient } from "../generated/mem.ts";
import { createSearchClient } from "../generated/search.ts";
import { createSpawnClient } from "../generated/spawn.ts";
import { createStoreClient } from "../generated/store.ts";
import { createTokenClient } from "../generated/token.ts";
import { createTrackClient } from "../generated/track.ts";
import { createWalletClient } from "../generated/wallet.ts";

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
