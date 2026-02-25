# R-5: Read Messages (JMAP Email/query + Email/get)

**Task:** Build relay.sh wrapper for reading email messages via JMAP.
**Depends on:** R-4 (done) — JMAP auth bridge, session bootstrap, `getJmapContext()`
**Scope:** `packages/relay`

## Context

R-4 delivered `getJmapContext(mailboxId, callerWallet)` which returns `{ apiUrl, accountId, inboxId, authHeader, ... }`. R-5 uses this to make JMAP `Email/query` + `Email/get` calls against Stalwart.

Two new endpoints:
- `GET /v1/mailboxes/:id/messages` — list messages (paginated, newest first)
- `GET /v1/mailboxes/:id/messages/:msgId` — get single message (full body)

## Design Decisions

**Cursor strategy:** Offset-based (`position` integer). JMAP `Email/query` returns `position` and `total` — pass position back as cursor. Simple, stateless, good enough for MVP. No opaque cursor encoding needed.

**Message ID:** Use JMAP's `id` directly. No `msg_` prefix wrapping — agents need the raw ID to pass back to `GET /messages/:msgId`. Stalwart's JMAP IDs are stable strings.

**Body handling for list vs detail:**
- List endpoint returns metadata only (from, to, subject, receivedAt, size, hasAttachment) — no body text. This keeps list responses small.
- Detail endpoint returns full message including `textBody` and `htmlBody`.

**JMAP body parts:** JMAP `Email/get` with `bodyValues` + `textBody`/`htmlBody` properties. The `textBody` and `htmlBody` properties return arrays of `EmailBodyPart` objects with `partId` references into `bodyValues`. Must request `fetchAllBodyValues: true` or specific part IDs.

**Folder filtering:** Default to `inboxId` from context. Support optional `folder` query param (`inbox`, `drafts`, `sent`, `all`). Map to the corresponding JMAP mailbox ID from context.

## Types (api.ts)

```
EmailAddress     { name: string | null; email: string }
EmailMessage     { id, from, to, subject, receivedAt, size, hasAttachment, preview }
EmailDetail      extends EmailMessage { textBody, htmlBody }
EmailListResponse { messages: EmailMessage[], total: number, position: number }
```

`preview` — JMAP provides a `preview` property (plaintext snippet, ~256 chars). Include in list response so agents can scan without fetching full body.

## JMAP Module (jmap.ts)

Add two new exports to existing `jmap.ts`:

### `queryEmails(ctx: JmapContext, opts: QueryOpts): Promise<QueryResult>`

**QueryOpts:** `{ mailboxId: string, limit: number, position: number }`

JMAP request — single batch with back-reference:

```json
{
  "using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
  "methodCalls": [
    ["Email/query", {
      "accountId": "...",
      "filter": { "inMailbox": "..." },
      "sort": [{ "property": "receivedAt", "isAscending": false }],
      "limit": 20,
      "position": 0
    }, "q"],
    ["Email/get", {
      "accountId": "...",
      "#ids": { "resultOf": "q", "name": "Email/query", "path": "/ids" },
      "properties": ["id", "from", "to", "subject", "receivedAt", "size", "hasAttachment", "preview"]
    }, "e"]
  ]
}
```

Returns: `{ messages: JmapEmail[], total: number, position: number }`

### `getEmail(ctx: JmapContext, emailId: string): Promise<JmapEmailDetail>`

JMAP request — single method call:

```json
{
  "using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
  "methodCalls": [
    ["Email/get", {
      "accountId": "...",
      "ids": ["emailId"],
      "properties": ["id", "from", "to", "cc", "subject", "receivedAt", "size", "hasAttachment", "preview", "textBody", "htmlBody", "bodyValues"],
      "fetchAllBodyValues": true
    }, "e"]
  ]
}
```

Body extraction logic:
1. Response has `textBody: [{ partId: "1" }]`, `htmlBody: [{ partId: "2" }]`
2. Look up each `partId` in `bodyValues` map: `bodyValues["1"].value` → plaintext string
3. Return `textBody` as the text value, `htmlBody` as the html value
4. Either can be `null` if the email doesn't have that content type

### Error handling

Both functions throw `JmapError` on:
- HTTP non-200 from Stalwart
- JMAP-level errors (methodResponse type is `"error"` instead of expected method name)
- Missing expected data (e.g., `Email/get` returns empty list for a requested ID)

For `getEmail` with a non-existent ID: JMAP returns an empty `list` and the ID in `notFound` array. Map this to `JmapError(404, "not_found", "Message not found")`.

## Service Layer (service.ts)

### `listMessages(mailboxId, callerWallet, opts)`

```
opts: { limit?: number, position?: number, folder?: "inbox" | "drafts" | "sent" | "all" }
returns: Promise<ServiceResult<EmailListResponse>>
```

Steps:
1. Call `getJmapContext(mailboxId, callerWallet)` — returns 404 if unauthorized
2. Resolve folder to JMAP mailbox ID: `inbox` → `ctx.inboxId`, `drafts` → `ctx.draftsId`, `sent` → `ctx.sentId`, `all` → omit `inMailbox` filter
3. Clamp `limit` to 1–100, default 20. Default `position` to 0.
4. Call `queryEmails(ctx, { mailboxId: resolvedFolderId, limit, position })`
5. Map JMAP response to `EmailMessage[]` (flatten `from`/`to` address arrays)
6. Return `{ ok: true, data: { messages, total, position } }`
7. Catch `JmapError` → return `{ ok: false, status, code, message }`

### `getMessage(mailboxId, callerWallet, messageId)`

```
returns: Promise<ServiceResult<EmailDetail>>
```

Steps:
1. Call `getJmapContext(mailboxId, callerWallet)` — returns 404 if unauthorized
2. Call `getEmail(ctx, messageId)`
3. Map JMAP response to `EmailDetail` (includes textBody/htmlBody)
4. Return `{ ok: true, data: detail }`
5. Catch `JmapError` → map 404 → not_found, others → jmap_error

## Routes (index.ts)

### `GET /v1/mailboxes/:id/messages`

Query params:
- `limit` — integer 1–100, default 20
- `position` — integer ≥ 0, default 0
- `folder` — `inbox` | `drafts` | `sent` | `all`, default `inbox`

Response 200:
```json
{
  "messages": [
    {
      "id": "abc123",
      "from": { "name": "Alice", "email": "[email protected]" },
      "to": [{ "name": null, "email": "[email protected]" }],
      "subject": "Hello",
      "receivedAt": "2026-02-25T10:30:00Z",
      "size": 1234,
      "hasAttachment": false,
      "preview": "Hey, just checking in about..."
    }
  ],
  "total": 150,
  "position": 0
}
```

### `GET /v1/mailboxes/:id/messages/:msgId`

Response 200:
```json
{
  "id": "abc123",
  "from": { "name": "Alice", "email": "[email protected]" },
  "to": [{ "name": null, "email": "[email protected]" }],
  "cc": [],
  "subject": "Hello",
  "receivedAt": "2026-02-25T10:30:00Z",
  "size": 1234,
  "hasAttachment": false,
  "preview": "Hey, just checking in about...",
  "textBody": "Hey, just checking in about the project...",
  "htmlBody": "<p>Hey, just checking in about the project...</p>"
}
```

Route handler follows existing pattern:
```
extract walletAddress → 403 if missing
extract params → call service function → map ServiceResult to HTTP response
```

## Address Flattening

JMAP `from` is always an array of `{ name, email }` objects. For the relay API:
- `from` → single `EmailAddress` (first element; emails have one sender)
- `to` → array of `EmailAddress`
- `cc` → array of `EmailAddress` (detail endpoint only)

If `from` is empty (shouldn't happen for received mail), return `{ name: null, email: "" }`.

## Files to Modify

| File | Changes |
|------|---------|
| `src/api.ts` | Add `EmailAddress`, `EmailMessage`, `EmailDetail`, `EmailListResponse` types. Add `"jmap_error"` to `ERROR_CODES`. |
| `src/jmap.ts` | Add `queryEmails()`, `getEmail()`, internal JMAP response types |
| `src/service.ts` | Add `listMessages()`, `getMessage()` |
| `src/index.ts` | Add two GET routes under `/v1/mailboxes/:id/messages` |
| `test/jmap.test.ts` | Add tests for `queryEmails()` and `getEmail()` |
| `test/service.test.ts` | Add tests for `listMessages()` and `getMessage()` |

No DB changes. No new files needed (extend existing modules).

## Test Assertions

### jmap.test.ts — queryEmails

- `queryEmails` sends correct JMAP batch (Email/query + Email/get with back-reference)
- Returns `{ messages, total, position }` from valid response
- `messages[0].from` is extracted from JMAP address array
- Empty inbox returns `{ messages: [], total: 0, position: 0 }`
- Throws `JmapError` on HTTP 401 (auth expired)
- Throws `JmapError` when JMAP response contains error method response

### jmap.test.ts — getEmail

- `getEmail` sends Email/get with body properties + `fetchAllBodyValues: true`
- Extracts `textBody` from `bodyValues` via `partId` reference
- Extracts `htmlBody` from `bodyValues` via `partId` reference
- Returns `null` for `htmlBody` when email is plaintext-only
- Throws `JmapError(404, "not_found")` when ID is in `notFound` array

### service.test.ts — listMessages

- Returns messages for valid mailbox + wallet
- Returns `not_found` for wrong wallet (ownership check via getJmapContext)
- Respects `limit` clamping (passing 200 → clamped to 100)
- Default folder is inbox (uses `ctx.inboxId`)
- `folder=sent` passes `ctx.sentId` to queryEmails
- `folder=all` omits `inMailbox` filter
- Returns `jmap_error` when JMAP call fails

### service.test.ts — getMessage

- Returns full message with textBody/htmlBody for valid request
- Returns `not_found` for wrong wallet
- Returns `not_found` when message ID doesn't exist (JMAP notFound)

## Before Closing

- [ ] Run `pnpm --filter @agentstack/relay check` (lint + typecheck + test)
- [ ] Run `pnpm -r test` (full workspace)
- [ ] Verify `from` flattening handles edge cases (empty array, multiple senders)
- [ ] Verify `bodyValues` extraction works for both text-only and multipart emails
- [ ] For every JMAP error path, verify the test covers it
- [ ] Confirm no DB changes were accidentally introduced
