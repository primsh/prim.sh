// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
import { describe, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532";
});

import { mockBunSqlite } from "@primsh/x402-middleware/testing";
vi.mock("bun:sqlite", () => mockBunSqlite());

vi.mock("../src/db.ts", () => ({
  getDb: vi.fn(),
  resetDb: vi.fn(),
  getLastDrip: vi.fn(),
  upsertDrip: vi.fn(),
  cleanupOldEntries: vi.fn(),
}));

vi.mock("viem");
vi.mock("viem/accounts");
vi.mock("viem/chains");

import {
  refillTreasury as _refillTreasury,
  dripUsdc as _dripUsdc,
  dripEth as _dripEth,
} from "../src/service.ts";

describe("faucet.sh service", () => {
  describe("refillTreasury", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("resolves with valid input");
  });

  describe("dripUsdc", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("resolves with valid input");
  });

  describe("dripEth", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("resolves with valid input");
  });
});
