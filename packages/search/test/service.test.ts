// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
import { describe, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532";
});

import { searchWeb as _searchWeb, searchNews as _searchNews } from "../src/service.ts";

describe("search.sh service", () => {
  describe("searchWeb", () => {
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

  describe("searchNews", () => {
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
