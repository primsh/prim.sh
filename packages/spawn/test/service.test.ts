// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532";
});

import { mockBunSqlite } from "@primsh/x402-middleware/testing";
vi.mock("bun:sqlite", () => mockBunSqlite());

vi.mock("../src/db.ts", () => ({
  getDb: vi.fn(),
  resetDb: vi.fn(),
  insertServer: vi.fn(),
  getServerById: vi.fn(),
  getServersByOwner: vi.fn(),
  countServersByOwner: vi.fn(),
  countActiveServersByOwner: vi.fn(),
  updateServerStatus: vi.fn(),
  deleteServerRow: vi.fn(),
  updateServerTypeAndImage: vi.fn(),
  insertSshKey: vi.fn(),
  getSshKeyById: vi.fn(),
  getSshKeysByOwner: vi.fn(),
  deleteSshKeyRow: vi.fn(),
}));

import {
  createServer,
  listServers,
  getServer,
  deleteServer,
  startServer,
  stopServer,
  rebootServer,
  resizeServer,
  rebuildServer,
  listSshKeys,
  deleteSshKey,
} from "../src/service.ts";

// BEGIN:GENERATED:UNIT
describe("spawn.sh service", () => {
  describe("createServer", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger server_limit_exceeded
    it.todo("returns server_limit_exceeded on error");

    // TODO: set up mocks to trigger provider_error
    it.todo("returns provider_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("listServers", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    it.todo("scopes to caller wallet address");
  });

  describe("getServer", () => {
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

  describe("deleteServer", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger provider_error
    it.todo("returns provider_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("startServer", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger provider_error
    it.todo("returns provider_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("stopServer", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger provider_error
    it.todo("returns provider_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("rebootServer", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger provider_error
    it.todo("returns provider_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("resizeServer", () => {
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

    // TODO: set up mocks to trigger provider_error
    it.todo("returns provider_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("rebuildServer", () => {
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

    // TODO: set up mocks to trigger provider_error
    it.todo("returns provider_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("listSshKeys", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    it.todo("scopes to caller wallet address");
  });

  describe("deleteSshKey", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger provider_error
    it.todo("returns provider_error on error");

    it.todo("scopes to caller wallet address");
  });
});
// END:GENERATED:UNIT
