// SPDX-License-Identifier: Apache-2.0
import { describe, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532";
});

import { mockBunSqlite } from "@primsh/x402-middleware/testing";
vi.mock("bun:sqlite", () => mockBunSqlite());

vi.mock("../src/db.ts", () => ({
  getDb: vi.fn(),
  resetDb: vi.fn(),
  getDeploymentById: vi.fn(),
  getDeploymentsByOwner: vi.fn(),
  insertDeployment: vi.fn(),
  updateDeploymentStatus: vi.fn(),
  incrementTotalMinted: vi.fn(),
  getPoolByTokenId: vi.fn(),
  insertPool: vi.fn(),
}));

vi.mock("viem");

import {
  validateCreateToken as _validateCreateToken,
  deployToken as _deployToken,
  listTokens as _listTokens,
  getToken as _getToken,
  mintTokens as _mintTokens,
  createPool as _createPool,
  getPool as _getPool,
  getLiquidityParams as _getLiquidityParams,
} from "../src/service.ts";

// BEGIN:GENERATED:UNIT
describe("token.sh service", () => {
  describe("validateCreateToken", () => {
    // TODO: replace with valid/invalid input for validateCreateToken
    it.todo("returns true for valid input");
    it.todo("returns false for invalid input");
  });

  describe("listTokens", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    it.todo("scopes to caller wallet address");
  });

  describe("getToken", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    it.todo("scopes to caller wallet address");
  });

  describe("getSupply", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger rpc_error
    it.todo("returns rpc_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("createPool", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger pool_exists
    it.todo("returns pool_exists on error");

    // TODO: set up mocks to trigger rpc_error
    it.todo("returns rpc_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("getPool", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger rpc_error
    it.todo("returns rpc_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("getLiquidityParams", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger rpc_error
    it.todo("returns rpc_error on error");

    it.todo("scopes to caller wallet address");
  });
});
// END:GENERATED:UNIT
