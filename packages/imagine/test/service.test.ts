// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532";
});

import { generate, upscale } from "../src/service.ts";

// BEGIN:GENERATED:UNIT
describe("imagine.sh service", () => {
  describe("generate", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger rate_limited
    it.todo("returns rate_limited on error");

    // TODO: set up mocks to trigger provider_error
    it.todo("returns provider_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("upscale", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger rate_limited
    it.todo("returns rate_limited on error");

    // TODO: set up mocks to trigger provider_error
    it.todo("returns provider_error on error");

    it.todo("scopes to caller wallet address");
  });

});
// END:GENERATED:UNIT
