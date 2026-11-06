# Responses retention and tenancy — 2026-11-06

Project Responses history now has a real retention policy and owner scoping.

## Storage

- SQLite `data/responses.db`, WAL, 5-second busy timeout.
- Columns: `id`, `owner_id`, `items_json`, `created_at`.
- Owner is `project` for project-key clients and the signed-in principal id for
  browser sessions.
- `previous_response_id` only resolves when the stored owner matches the
  caller; a different owner gets a 404.

## Policy

- `maxResponsesPerOwner` — default 200.
- `ttlDays` — default 7; `0` disables age pruning.
- Pruning runs when a response is saved and when the policy is applied.
- SQLite orders by `created_at DESC, rowid DESC` so same-millisecond saves prune
  deterministically.

API:

- `GET /api/responses/retention` — policy, total, owners, oldest/newest.
- `POST /api/responses/retention` — update max/TTL and prune.
- UI: **Manage → Responses**, `/manage/retention`.

## Live test

Set the policy to 2 responses per owner, 30-day TTL, then created three
project-key responses:

```
resp_mw4m6pbbw8v6tm
resp_mw4m6ptedlr832
resp_mw4m6q716zq2bs
```

After the third save, the database retained two:

```
resp_mw4m6ptedlr832
resp_mw4m6q716zq2bs
```

Checks:

```
OLDEST: 404 - Previous response resp_mw4m6pbbw8v6tm was not found.
LATEST: resp_mw4m7rejw81d89 latest works
TENANT: 404 - Previous response resp_mw4m6q716zq2bs was not found.
```

The last check used a signed-in browser session for a response created with the
project key, proving owner scoping.

`page.png` shows the Manage → Responses page with the 2/owner · 30-day policy and
the project owner count.

## Tests

`tests/response-store.test.ts` covers:

- reopening the SQLite store (cross-process persistence),
- owner-scoped loads,
- per-owner count pruning with stats,
- TTL pruning.

The Python suite continues to cover streaming/tool follow-ups through the same
owner-scoped store.
