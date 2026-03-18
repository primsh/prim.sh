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
  insertWallet: vi.fn(),
  getWalletByAddress: vi.fn(),
  getWalletsByOwner: vi.fn(),
  deactivateWallet: vi.fn(),
  reactivateWallet: vi.fn(),
  getExecution: vi.fn(),
  insertExecution: vi.fn(),
  completeExecution: vi.fn(),
  tryClaim: vi.fn(),
  markAborted: vi.fn(),
  appendEvent: vi.fn(),
  getEventsByExecution: vi.fn(),
  insertDeadLetter: vi.fn(),
  getExecutionsByWallet: vi.fn(),
  insertFundRequest: vi.fn(),
  getFundRequestById: vi.fn(),
  getFundRequestsByWallet: vi.fn(),
  updateFundRequestStatus: vi.fn(),
  getPolicy: vi.fn(),
  upsertPolicy: vi.fn(),
  incrementDailySpent: vi.fn(),
  resetDailySpentIfNeeded: vi.fn(),
  setPauseState: vi.fn(),
}));

vi.mock("viem");

import {
  registerWallet as _registerWallet,
  listWallets as _listWallets,
  getWallet as _getWallet,
  deactivateWallet as _deactivateWallet,
  createFundRequest as _createFundRequest,
  listFundRequests as _listFundRequests,
  approveFundRequest as _approveFundRequest,
  denyFundRequest as _denyFundRequest,
  pauseWallet as _pauseWallet,
  resumeWallet as _resumeWallet,
} from "../src/service.ts";

describe("wallet.sh service", () => {
  describe("registerWallet", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger invalid_request
    it.todo("returns invalid_request on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger duplicate_request
    it.todo("returns duplicate_request on error");

    it.todo("scopes to caller wallet address");
  });

  describe("listWallets", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger rate_limited
    it.todo("returns rate_limited on error");

    it.todo("scopes to caller wallet address");
  });

  describe("getWallet", () => {
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

  describe("deactivateWallet", () => {
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

  describe("createFundRequest", () => {
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

    it.todo("scopes to caller wallet address");
  });

  describe("listFundRequests", () => {
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

  describe("approveFundRequest", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger duplicate_request
    it.todo("returns duplicate_request on error");

    it.todo("scopes to caller wallet address");
  });

  describe("denyFundRequest", () => {
    // TODO: set up db/provider mocks to return valid data, then replace .todo with .test
    it.todo("returns ok:true with valid input");

    // TODO: set up mocks to trigger payment_required
    it.todo("returns payment_required on error");

    // TODO: set up mocks to trigger forbidden
    it.todo("returns forbidden on error");

    // TODO: set up mocks to trigger not_found
    it.todo("returns not_found on error");

    // TODO: set up mocks to trigger duplicate_request
    it.todo("returns duplicate_request on error");

    it.todo("scopes to caller wallet address");
  });

  describe("pauseWallet", () => {
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

    it.todo("scopes to caller wallet address");
  });

  describe("resumeWallet", () => {
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

    it.todo("scopes to caller wallet address");
  });
});
