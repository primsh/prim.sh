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
  runInTransaction: vi.fn(),
  insertZone: vi.fn(),
  getZoneById: vi.fn(),
  getZoneByDomain: vi.fn(),
  getZonesByOwner: vi.fn(),
  countZonesByOwner: vi.fn(),
  updateZoneStatus: vi.fn(),
  deleteZoneRow: vi.fn(),
  insertRecord: vi.fn(),
  getRecordById: vi.fn(),
  getRecordByCloudflareId: vi.fn(),
  getRecordsByZone: vi.fn(),
  updateRecordRow: vi.fn(),
  deleteRecordRow: vi.fn(),
  deleteRecordsByZone: vi.fn(),
  insertQuote: vi.fn(),
  getQuoteById: vi.fn(),
  insertRegistration: vi.fn(),
  getRegistrationByRecoveryToken: vi.fn(),
  getRegistrationByDomain: vi.fn(),
  updateRegistration: vi.fn(),
}));

import {
  createZone,
  listZones,
  getZone,
  deleteZone,
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
  batchRecords,
  quoteDomain,
  verifyZone,
  activateZone,
  searchDomains,
} from "../src/service.ts";

// BEGIN:GENERATED:UNIT
describe("domain.sh service", () => {
  describe("createZone", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger domain_taken
    it.todo("returns domain_taken on error");

    // TODO: set up mocks to trigger cloudflare_error
    it.todo("returns cloudflare_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("listZones", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    it.todo("scopes to caller wallet address");
  });

  describe("getZone", () => {
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

  describe("deleteZone", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger cloudflare_error
    it.todo("returns cloudflare_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("createRecord", () => {
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

    // TODO: set up mocks to trigger cloudflare_error
    it.todo("returns cloudflare_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("listRecords", () => {
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

  describe("getRecord", () => {
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

  describe("updateRecord", () => {
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

    // TODO: set up mocks to trigger cloudflare_error
    it.todo("returns cloudflare_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("deleteRecord", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger cloudflare_error
    it.todo("returns cloudflare_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("batchRecords", () => {
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

    // TODO: set up mocks to trigger cloudflare_error
    it.todo("returns cloudflare_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("quoteDomain", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger registrar_error
    it.todo("returns registrar_error on error");

    it.todo("scopes to caller wallet address");
  });

  describe("verifyZone", () => {
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

  describe("activateZone", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger rate_limited
    it.todo("returns rate_limited on error");

    it.todo("scopes to caller wallet address");
  });

  describe("searchDomains", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger registrar_error
    it.todo("returns registrar_error on error");

    it.todo("scopes to caller wallet address");
  });
});
// END:GENERATED:UNIT
