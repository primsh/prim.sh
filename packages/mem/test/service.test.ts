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
  insertCollection: vi.fn(),
  getCollectionById: vi.fn(),
  getCollectionByOwnerAndName: vi.fn(),
  getCollectionsByOwner: vi.fn(),
  countCollectionsByOwner: vi.fn(),
  deleteCollectionRow: vi.fn(),
  upsertCacheEntry: vi.fn(),
  getCacheEntry: vi.fn(),
  deleteCacheEntry: vi.fn(),
  deleteExpiredEntries: vi.fn(),
}));

import {
  isValidCollectionName as _isValidCollectionName,
  isValidCacheNamespace as _isValidCacheNamespace,
  isValidUuidV4 as _isValidUuidV4,
  createCollection as _createCollection,
  listCollections as _listCollections,
  getCollection as _getCollection,
  deleteCollection as _deleteCollection,
} from "../src/service.ts";

describe("mem.sh service", () => {
  describe("isValidCollectionName", () => {
    // TODO: replace with valid/invalid input for isValidCollectionName
    it.todo("returns true for valid input");
    it.todo("returns false for invalid input");
  });

  describe("isValidCacheNamespace", () => {
    // TODO: replace with valid/invalid input for isValidCacheNamespace
    it.todo("returns true for valid input");
    it.todo("returns false for invalid input");
  });

  describe("isValidUuidV4", () => {
    // TODO: replace with valid/invalid input for isValidUuidV4
    it.todo("returns true for valid input");
    it.todo("returns false for invalid input");
  });

  describe("createCollection", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger collection_name_taken
    it.todo("returns collection_name_taken on error");

    // TODO: set up mocks to trigger qdrant_error
    it.todo("returns qdrant_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("listCollections", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    it.todo("scopes to caller wallet address");
  });

  describe("getCollection", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger qdrant_error
    it.todo("returns qdrant_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("deleteCollection", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger qdrant_error
    it.todo("returns qdrant_error on error");

    it.todo("scopes to caller wallet address");
  });
});
