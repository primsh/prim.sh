// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
import { describe, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532";
});

vi.mock("yaml");

import { scaffold as _scaffold, validate as _validate } from "../src/service.ts";

describe("create.sh service", () => {
  describe("scaffold", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");
  });

  describe("validate", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");
  });
});
