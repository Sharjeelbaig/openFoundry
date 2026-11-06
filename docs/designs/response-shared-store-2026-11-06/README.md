# Cross-machine Responses store — 2026-11-06

Responses history and its retention policy can now live behind a configurable
shared backend instead of a per-install JSON/DB file.

## Backends

| Backend | Configuration |
| --- | --- |
| Local SQLite (default) | `OPENFOUNDRY_RESPONSE_DB_PATH` optionally moves the file to a shared volume |
| Shared HTTP store | `OPENFOUNDRY_RESPONSE_STORE=http`, `OPENFOUNDRY_RESPONSE_STORE_URL`, `OPENFOUNDRY_RESPONSE_STORE_TOKEN` |

The public functions in `src/lib/response-store.ts` keep the same signatures.
They delegate to the local SQLite adapter or the HTTP client in
`src/lib/response-store-http.ts`. The store server route is
`/api/responses/store/<save|load|prune|stats|policy>` and checks the bearer token
with a constant-time comparison. It calls the local adapter directly, so a store
server cannot recurse into its own HTTP client.

Retention policy is one row in the shared database. Every client reads and
writes the same policy; owner-scoped `previous_response_id` lookups still apply.
The Manage → Responses page now reports whether it is using the local SQLite file
or a shared HTTP store.

## Live two-process evidence

Two production servers used different data directories:

- **A** (`127.0.0.1:3010`, `/tmp/of-shared-store-a`): shared store server with
  `OPENFOUNDRY_RESPONSE_DB_PATH=/tmp/of-shared-store-data/responses.db` and a
  bearer token.
- **B** (`127.0.0.1:3011`, `/tmp/of-shared-store-b`): project Responses client
  with `OPENFOUNDRY_RESPONSE_STORE=http` pointing at A.

`live-summary.txt` and `live-shared-store.json`:

```
Unauthorized stats: 401
Policy: {"maxResponsesPerOwner": 3, "ttlDays": 30}
First response: resp_mw4sy17jmb5320 -> shared store works.
Stats after first: {"total": 1, "owners": [{"ownerId": "project", "count": 1}]}
Loaded from A: resp_mw4sy17jmb5320 with 2 conversation items
Follow-up on B with previous_response_id: resp_mw4sy1pt5j2e6z -> cross machine works.
Final stats: {"total": 2, "owners": [{"ownerId": "project", "count": 2}]}
B responses.db exists: False
A shared DB exists: True
```

The follow-up used `previous_response_id` to load the first response from A,
prove that B has no local `responses.db`, and save the second response back to
A.

## Tests

`tests/response-store-shared.test.ts` (5 tests):

- saves/loads through the HTTP backend while the client data directory has no
  `responses.db`,
- owner-scoped lookups,
- shared policy and per-owner count pruning,
- wrong-token rejection,
- missing URL/token failure,
- configured SQLite path outside the data directory.

`tests/response-store.test.ts` (6 tests) continues to cover local persistence,
owner scoping and TTL/count pruning.

The full Vitest suite is 241 passing with 1 skipped (42 files). The Python live
suite remains 14 tests.

## API

```bash
# Store server (A)
OPENFOUNDRY_RESPONSE_STORE_TOKEN=... \
OPENFOUNDRY_RESPONSE_DB_PATH=/shared/responses.db \
  npm run start

# Client (B)
OPENFOUNDRY_RESPONSE_STORE=http \
OPENFOUNDRY_RESPONSE_STORE_URL=http://store-host:3010/api/responses/store \
OPENFOUNDRY_RESPONSE_STORE_TOKEN=... \
  npm run start
```

Store routes:

```
POST /api/responses/store/save
GET  /api/responses/store/load?id=...&ownerId=...
POST /api/responses/store/prune
GET  /api/responses/store/stats
GET|POST /api/responses/store/policy
```

## Limits

- Per-tenant tokens, quotas and audit isolation are implemented on top of this
  transport; see `docs/designs/response-tenant-governance-2026-11-06/`. Tenant
  creation, quota editing, rotation, usage and audit now have a Manage →
  Tenants UI; see `docs/designs/response-tenant-admin-2026-11-06/`. This
  evidence predates that UI.
- The store server is a single point of failure; there is no replication or
  high-availability story.
- The SQLite path may be placed on a shared volume, but SQLite WAL on network
  filesystems requires correct locking and is not recommended for arbitrary NFS
  setups. Use the HTTP backend when machines cannot share a filesystem safely.
- Owner IDs are caller-supplied strings. They isolate normal project/principal
  history, but they are not a cryptographic tenant boundary.
