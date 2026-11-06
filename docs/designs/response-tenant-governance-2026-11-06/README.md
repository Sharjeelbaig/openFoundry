# Per-tenant shared Responses store — 2026-11-06

The shared store now supports multiple tenants, each with its own bearer token,
response/storage quotas, retention policy and audit stream.

## Configuration

The store server reads `OPENFOUNDRY_RESPONSE_STORE_TOKENS` as a JSON array:

```json
[
  {
    "token": "acme-token",
    "tenant": "acme",
    "quotaResponses": 2,
    "quotaBytes": 100000
  },
  {
    "token": "globex-token",
    "tenant": "globex",
    "quotaResponses": 10,
    "quotaBytes": 100000
  }
]
```

- `tenant` must use lowercase letters, numbers, underscores or hyphens.
- Tokens must be unique; tenant names must be unique.
- Quotas default to 10,000 responses and 100 MB per tenant.
- The legacy `OPENFOUNDRY_RESPONSE_STORE_TOKEN` / `OPENFOUNDRY_RESPONSE_STORE_TENANT`
  pair still works as one tenant when the token array is absent.
- A client process uses one token in `OPENFOUNDRY_RESPONSE_STORE_TOKEN`; the
  store resolves it to the tenant and passes that tenant to every local query.

## Isolation

- `responses.tenant_id` scopes history. A token for tenant A cannot load tenant
  B's response even with the same response id and owner id.
- `response_policy.tenant_id` gives each tenant an independent per-owner
  retention policy (default 200 responses, 7 days).
- Quotas are checked on save:
  - response count across the tenant -> HTTP 429,
  - stored JSON bytes across the tenant -> HTTP 413.
- `response_store_audit` records `save`, `update`, `load`, `prune` and `policy`
  actions with `tenant_id`. `GET /api/responses/store/audit` returns only the
  requesting token's tenant.
- Old databases are migrated in place: `responses` gains `tenant_id` with
  `default`, and the single-row policy table becomes a per-tenant table. The
  existing `default` policy is preserved.

## Live evidence

`live-summary.txt` and `live-tenant-store.json` were captured with:

- Store server **A** on `127.0.0.1:3010`, tenants `acme` and `globex`, shared
  SQLite at `/tmp/of-tenant-store-data/responses.db`.
- Client **B** on `127.0.0.1:3011`, separate data directory, configured with the
  `acme` token.

```
Unauthorized stats: 401
Acme response via B: resp_mw4tm4rpc2528h -> tenant acme works.
Acme stats after B: {"tenantId":"acme","total":1,"quotaResponses":2,...}
Globex stats after B: {"tenantId":"globex","total":0,"quotaResponses":10,...}
Globex load of acme response: {"response": null}
Acme second save status: 200
Acme third save: 429 {"error":"Tenant \"acme\" has reached its response quota (2).","code":"quota_exceeded"}
Acme policy: {"maxResponsesPerOwner":1,"ttlDays":30}
Globex policy: {"maxResponsesPerOwner":200,"ttlDays":7}
Acme audit actions: ['prune', 'policy', 'save', 'save']
Globex audit: {"entries": []}
B responses.db exists: False
A shared DB exists: True
```

B stored the response in A under `acme`; `globex` saw zero rows and could not
load it. The quota and policy changes affected only `acme`, and the audit stream
was tenant-scoped.

## Tests

`tests/response-store-tenants.test.ts` (6 tests):

- token -> tenant/quota resolution,
- row and stats isolation,
- per-tenant retention policies,
- response quota enforcement without affecting another tenant,
- audit isolation,
- legacy single-token fallback.

`tests/response-store-shared.test.ts` (5 tests) and
`tests/response-store.test.ts` (6 tests) still cover the shared client and the
local SQLite backend.

The full Vitest suite is 238 passing with 1 skipped (41 files).

## Limits

- Tenant creation, quotas, token rotation, usage and audit now have a
  Manage → Tenants UI; see
  `docs/designs/response-tenant-admin-2026-11-06/`. The evidence in this file
  predates that UI and used the environment/API path.
- The store server is a single point of failure. There is no replication.
- Quotas are count/bytes, not request-rate limits.
- Owner IDs remain caller-supplied within a tenant; they are not a separate
  cryptographic boundary.
- Token rotation is available in the admin UI and takes effect immediately;
  there is no tenant-facing self-service portal.
