# R-6: Send Messages (JMAP Email/set + EmailSubmission/set)

**Task:** Build relay.sh wrapper for sending email via JMAP.
**Depends on:** R-4 (done) — JMAP auth bridge, `getJmapContext()` with `identityId`
**Scope:** `packages/relay`

## Context

R-4 delivered `getJmapContext()` which returns `identityId` (needed for EmailSubmission). R-5 added `queryEmails()`/`getEmail()` and the `jmapCall()` helper. R-6 adds one new endpoint:

- `POST /v1/mailboxes/:id/send` — send an email from the mailbox

Under the hood: single JMAP batch with `Email/set` (create draft) + `EmailSubmission/set` (submit) using back-references. Stalwart moves the email to Sent automatically.

## Design Decisions

**Recipient format:** Accept `to` as a single string (email address) for MVP. Array support can come later. The `cc` and `bcc` fields are also optional strings for v1.

**Body format:** For `Email/set`, use `bodyStructure` + `bodyValues` (not the `textBody`/`htmlBody` arrays used in `Email/get` responses). This is the JMAP-canonical way to construct new emails.

**Multipart handling:**
| body provided | html provided | bodyStructure type |
|---------------|---------------|-------------------|
| yes | no | `text/plain` single part |
| no | yes | `text/html` single part |
| yes | yes | `multipart/alternative` with two children |

**Attachments:** Out of scope for R-6. Spec mentions them but relay.md Phase 1 is receive-only, Phase 2 is sending with guardrails. Text + HTML is sufficient.

**JMAP submission namespace:** `jmapCall()` currently only includes `urn:ietf:params:jmap:mail`. For submission, add an optional `namespaces` parameter (string array) so `sendEmail()` can include `urn:ietf:params:jmap:submission`.

**Envelope construction:** `EmailSubmission/set` requires an `envelope` with `mailFrom` and `rcptTo`. Construct from the mailbox's address (from context row) and the `to` field.

**Response:** Per spec: `{ "message_id": "...", "status": "sent" }`. Use JMAP's created email ID as `message_id`. Status is always `"sent"` on success (JMAP submission is synchronous in Stalwart).

## JMAP Batch Structure

Single request with two method calls and a back-reference:

**Email/set** (ref tag `"e"`):
- `accountId`: from context
- `create.draft`: mailboxIds (`{ [draftsId]: true }`), from, to, subject, bodyStructure, bodyValues
- For multipart: bodyStructure type `"multipart/alternative"`, subParts array with text/plain + text/html children

**EmailSubmission/set** (ref tag `"es"`):
- `accountId`: from context
- `create.sub.identityId`: from context
- `create.sub.emailId`: back-reference `{ "resultOf": "e", "name": "Email/set", "path": "/created/draft/id" }`
- `create.sub.envelope`: `{ mailFrom: { email: address }, rcptTo: [{ email: to }] }`

## Types (api.ts)

```
SendMessageRequest  { to: string; subject: string; body?: string; html?: string; cc?: string; bcc?: string }
SendMessageResponse { message_id: string; status: "sent" }
```

Validation: at least one of `body` or `html` must be provided. `to` must be a non-empty string.

## JMAP Module (jmap.ts)

### Update `jmapCall()`

Add optional `extraNamespaces?: string[]` parameter. When provided, append to the `using` array. This avoids a breaking change — existing callers (queryEmails, getEmail) pass nothing and get the current behavior.

### `sendEmail(ctx, opts): Promise<SendResult>`

**SendEmailOpts:**
- `from: { name: string | null; email: string }`
- `to: { name: string | null; email: string }[]`
- `cc?: { name: string | null; email: string }[]`
- `bcc?: { name: string | null; email: string }[]`
- `subject: string`
- `textBody: string | null`
- `htmlBody: string | null`
- `identityId: string`
- `draftsId: string`

**SendResult:** `{ messageId: string; submissionId: string }`

Logic:
1. Build bodyStructure based on which body parts are provided (see decision table above)
2. Call `jmapCall()` with `extraNamespaces: ["urn:ietf:params:jmap:submission"]`
3. Check for error responses
4. Extract created email ID from `Email/set` response: `response[1].created.draft.id`
5. Extract submission ID from `EmailSubmission/set` response: `response[1].created.sub.id`
6. If `Email/set` returns `notCreated`, throw `JmapError(400, "invalid_request", reason)`
7. If `EmailSubmission/set` returns `notCreated`, throw `JmapError(502, "jmap_error", reason)`

### Error extraction from `notCreated`

JMAP `Email/set` and `EmailSubmission/set` can return `notCreated` instead of `created`:
```json
{ "notCreated": { "draft": { "type": "invalidProperties", "description": "..." } } }
```

Check `notCreated` before `created` for both methods.

| Email/set result | EmailSubmission/set result | Outcome |
|------------------|---------------------------|---------|
| created | created | Success → return messageId + submissionId |
| notCreated | — | Throw JmapError(400, "invalid_request") |
| created | notCreated | Throw JmapError(502, "jmap_error") |
| error method | — | Caught by checkMethodError |

## Service Layer (service.ts)

### `sendMessage(mailboxId, callerWallet, request)`

```
request: SendMessageRequest
returns: Promise<ServiceResult<SendMessageResponse>>
```

Steps:
1. Validate request: `to` must be non-empty, at least one of `body`/`html` required
2. Call `getJmapContext(mailboxId, callerWallet)` → 404 if unauthorized
3. Look up mailbox row to get `address` (the sender email). Use `getMailboxById()` — but context already validated ownership, so just need the address. **Note:** JmapContext doesn't include the sender address. Need to read it from the DB row.

**Dependency: getting sender address.** Two options:
- (A) Add `address` to `JmapContext` interface
- (B) Call `getMailboxById()` separately in sendMessage

Option A is cleaner — the address is needed for JMAP calls and it's a stable mailbox property. Add `address: string` to `JmapContext` in `context.ts`, populate from `row.address`.

4. Build `to` array: parse single email string → `[{ name: null, email: to }]`
5. Build `cc`/`bcc` arrays similarly if provided
6. Call `sendEmail(ctx, { from, to, cc, bcc, subject, textBody, htmlBody, identityId, draftsId })`
7. Return `{ ok: true, data: { message_id: result.messageId, status: "sent" } }`
8. Catch `JmapError` → map to ServiceResult

## Route (index.ts)

### `POST /v1/mailboxes/:id/send`

Request body:
```json
{
  "to": "[email protected]",
  "subject": "Your order shipped",
  "body": "Tracking: ABC123",
  "html": "<p>Tracking: <b>ABC123</b></p>"
}
```

Response 200:
```json
{
  "message_id": "email_abc",
  "status": "sent"
}
```

Validation errors → 400. Ownership errors → 404. JMAP errors → 502.

## Files to Modify

| File | Changes |
|------|---------|
| `src/api.ts` | Add `SendMessageRequest`, `SendMessageResponse` types |
| `src/jmap.ts` | Add `extraNamespaces` param to `jmapCall()`, add `sendEmail()` function |
| `src/context.ts` | Add `address: string` to `JmapContext`, populate from row |
| `src/service.ts` | Add `sendMessage()` function |
| `src/index.ts` | Add `POST /v1/mailboxes/:id/send` route |
| `test/jmap.test.ts` | Add `sendEmail` tests (success, notCreated, multipart) |
| `test/service.test.ts` | Add `sendMessage` tests (success, validation, ownership, JMAP error) |
| `test/context.test.ts` | Update assertions to include `address` field |

## Test Assertions

### jmap.test.ts — sendEmail

- `sendEmail` sends Email/set + EmailSubmission/set batch with submission namespace in `using`
- Returns `{ messageId, submissionId }` on success
- Back-reference path is `/created/draft/id`
- Throws `JmapError(400, "invalid_request")` when `Email/set` returns `notCreated`
- Throws `JmapError(502, "jmap_error")` when `EmailSubmission/set` returns `notCreated`
- Text-only body: bodyStructure type is `text/plain`, single part
- HTML-only body: bodyStructure type is `text/html`, single part
- Both text + HTML: bodyStructure type is `multipart/alternative` with two subParts

### service.test.ts — sendMessage

- Returns `{ message_id, status: "sent" }` for valid request
- Returns `not_found` for wrong wallet (ownership check)
- Returns `invalid_request` when `to` is empty
- Returns `invalid_request` when both `body` and `html` are missing
- Returns `jmap_error` when JMAP call fails
- `from` address is set from mailbox address (not from request)

### context.test.ts — address field

- Update "returns cached context" test: assert `result.data.address` equals seeded `address` value
- Update "discovers session" test: assert `result.data.address` is present

## Before Closing

- [ ] Run `pnpm --filter @agentstack/relay check` (lint + typecheck + test)
- [ ] Run `pnpm -r test` (full workspace)
- [ ] Verify `jmapCall()` includes submission namespace only when `extraNamespaces` is passed
- [ ] Verify multipart bodyStructure is correct for text+html case
- [ ] Verify `notCreated` error extraction covers both Email/set and EmailSubmission/set
- [ ] Verify `address` field added to JmapContext doesn't break existing context.test.ts assertions
- [ ] For every boolean condition (body present, html present), verify both True and False paths tested
