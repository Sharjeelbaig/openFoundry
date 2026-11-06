# Multi-process Responses retention policy — 2026-11-06

The Responses retention policy moved from `data/response-retention.json` into
SQLite so every server process reads and writes the same durable row.

## Storage

`data/responses.db`:

```sql
CREATE TABLE response_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  max_responses_per_owner INTEGER NOT NULL,
  ttl_days INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
```

- One row (`id = 1`).
- Defaults are inserted on first open: 200 responses per owner, 7-day TTL.
- `getRetentionPolicy()` / `setRetentionPolicy()` use that table.
- Pruning still runs on save and on policy update.
- No `response-retention.json` is created or read.

## Live two-process test

Two server processes shared `OPENFOUNDRY_DATA_DIR`:

- Process A: `next dev` on `http://127.0.0.1:3000`
- Process B: `next start` on `http://127.0.0.1:3001`
  (`OPENFOUNDRY_VOICE_WS_PORT=3003`, scheduler disabled)

Writes and reads:

```
SET on 3000: {"maxResponsesPerOwner":7,"ttlDays":11}
READ on 3001: {"maxResponsesPerOwner":7,"ttlDays":11}

SET on 3001: {"maxResponsesPerOwner":5,"ttlDays":9}
READ on 3000: {"maxResponsesPerOwner":5,"ttlDays":9}
```

SQLite row after the second write:

```
(5, 9, '2026-11-06T07:31:56.863Z')
```

`sync-summary.txt` and `db-policy.txt` record the outputs.

## Tests

`tests/response-store.test.ts` now checks:

- the policy survives closing and reopening the SQLite connection,
- the policy row is visible through a second independent `DatabaseSync`
  connection,
- no JSON policy file is created,
- owner scoping, count pruning and TTL pruning still work.

## Notes

The policy table is local to the machine's data directory. If multiple machines
share a Responses database, that would need a network database service; this step
covers multiple processes on the same install.
