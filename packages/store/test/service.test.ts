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
  getBucketById: vi.fn(),
  getBucketByCfName: vi.fn(),
  getBucketByNameAndOwner: vi.fn(),
  getBucketsByOwner: vi.fn(),
  countBucketsByOwner: vi.fn(),
  getTotalStorageByOwner: vi.fn(),
  insertBucket: vi.fn(),
  deleteBucketRow: vi.fn(),
  updateBucketPublic: vi.fn(),
  getQuota: vi.fn(),
  setQuota: vi.fn(),
  incrementUsage: vi.fn(),
  decrementUsage: vi.fn(),
  setUsage: vi.fn(),
}));

import {
  isValidBucketName as _isValidBucketName,
  isValidObjectKey as _isValidObjectKey,
  createBucket as _createBucket,
  listBuckets as _listBuckets,
  getBucket as _getBucket,
  deleteBucket as _deleteBucket,
  putObject as _putObject,
  getObject as _getObject,
  deleteObject as _deleteObject,
  listObjects as _listObjects,
  presignObject as _presignObject,
} from "../src/service.ts";

// BEGIN:GENERATED:UNIT
describe("store.sh service", () => {
  describe("isValidBucketName", () => {
    // TODO: replace with valid/invalid input for isValidBucketName
    it.todo("returns true for valid input");
    it.todo("returns false for invalid input");
  });

  describe("isValidObjectKey", () => {
    // TODO: replace with valid/invalid input for isValidObjectKey
    it.todo("returns true for valid input");
    it.todo("returns false for invalid input");
  });

  describe("createBucket", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger bucket_limit_exceeded
    it.todo("returns bucket_limit_exceeded on error");

    // TODO: set up mocks to trigger r2_error
    it.todo("returns r2_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("listBuckets", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    it.todo("scopes to caller wallet address");
  });

  describe("getBucket", () => {
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

  describe("deleteBucket", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger r2_error
    it.todo("returns r2_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("putObject", () => {
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

    // TODO: set up mocks to trigger quota_exceeded
    it.todo("returns quota_exceeded on error");

    // TODO: set up mocks to trigger storage_limit_exceeded
    it.todo("returns storage_limit_exceeded on error");

    // TODO: set up mocks to trigger r2_error
    it.todo("returns r2_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("getObject", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger r2_error
    it.todo("returns r2_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("deleteObject", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger r2_error
    it.todo("returns r2_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("listObjects", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger r2_error
    it.todo("returns r2_error on error");

    it.todo("scopes to caller wallet address");
  });
});
// END:GENERATED:UNIT
