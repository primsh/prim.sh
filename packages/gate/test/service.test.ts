// SPDX-License-Identifier: Apache-2.0
import { describe, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532";
});

import { mockBunSqlite } from "@primsh/x402-middleware/testing";
vi.mock("bun:sqlite", () => mockBunSqlite());

vi.mock("../src/db.ts", () => ({
  seedCodes: vi.fn(),
  validateAndBurn: vi.fn(),
  unburnCode: vi.fn(),
  resetDb: vi.fn(),
  generateCode: vi.fn(),
  insertCodes: vi.fn(),
  listCodes: vi.fn(),
  revokeCode: vi.fn(),
}));

import { redeemInvite as _redeemInvite } from "../src/service.ts";

// BEGIN:GENERATED:UNIT
describe("gate.sh service", () => {
  describe("redeemInvite", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger invalid_code
    it.todo("returns invalid_code on error");

    // TODO: set up mocks to trigger code_redeemed
    it.todo("returns code_redeemed on error");

    // TODO: set up mocks to trigger not_configured
    it.todo("returns not_configured on error");

    // TODO: set up mocks to trigger fund_error
    it.todo("returns fund_error on error");
  });
});
// END:GENERATED:UNIT
