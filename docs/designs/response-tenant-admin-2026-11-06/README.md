# Cross-tenant Responses store administration — 2026-11-06

The shared Responses store now has a real tenant registry and a Manage →
Tenants UI. Operators can create tenants, issue and rotate tokens, set response
and byte quotas, disable a tenant, inspect usage and read the tenant-scoped
audit stream.

This is local usage accounting. There is no payment processor, invoice,
subscription or external billing integration, and the UI says so.

## Registry and security

`src/lib/response-tenants.ts` owns the registry in the same SQLite database as
responses, policy and audit:

```sql
response_tenants (
  tenant_id, token_hash, token_prefix, quota_responses, quota_bytes,
  created_at, updated_at, last_used_at, disabled_at
)
response_store_meta (key, value)
```

- Tokens are generated as `ofst_` + 24 random bytes (base64url).
- Only a SHA-256 hash and a 12-character prefix are stored. The raw token is
  returned once on create or rotate; the list API never returns it.
- `OPENFOUNDRY_RESPONSE_STORE_TOKENS` is imported into the registry exactly once
  (`response_store_meta.tenants_seeded`). After that the table is authoritative,
  so rotating a token in the UI invalidates an old value still present in the
  environment.
- `resolveStoreTenantAsync` checks the persistent hash first, rejects disabled
  tenants, and updates `last_used_at` at most every 30 seconds.
- Disabling a tenant takes effect on the next request.
- Deleting a tenant with history requires `purge=true`; the purge removes its
  responses, policy and audit rows in one transaction and leaves a
  `tenant.delete` audit entry.

## Admin API

| Route | Purpose |
| --- | --- |
| `GET /api/responses/tenants` | Registry, per-tenant usage and totals |
| `POST /api/responses/tenants` | Create `{tenant, quotaResponses?, quotaBytes?}`; returns the token once |
| `GET /api/responses/tenants/[tenant]` | One tenant with usage |
| `PATCH /api/responses/tenants/[tenant]` | Quotas, `disabled`, or `rotateToken: true` |
| `DELETE /api/responses/tenants/[tenant]?purge=true` | Delete, optionally purging history |
| `GET /api/responses/tenants/audit?limit=100&tenant=` | All-tenant or per-tenant audit |

All six are session routes under `settings.read`/`settings.write`; the write
actions require the Owner role. The store's bearer-token route is still public
by design and resolves the tenant from the token.

Quota errors now propagate correctly end to end:

- the store server returns `429` for response count and `413` for bytes,
- `response-store-http.ts` preserves the status in `ResponseStoreQuotaError`,
- the project Responses route returns
  `{"error":{"message":...,"type":"quota_exceeded","code":"quota_exceeded"}}`.

Authentication failures are preserved too: a rotated client token returns
`401` with `type: authentication_error`, not a generic 500.

## UI

`src/app/manage/tenants/page.tsx`, linked from Manage → Tenants:

- **Tenants** tab: aggregate cards, tenant table (token prefix, status,
  responses/quota, bytes/quota, owners, last used), create dialog and per-tenant
  manage dialog with quota editing, disable, token rotation and delete.
- **Usage & audit** tab: billing model, summed quotas, per-tenant usage and the
  full audit stream with a tenant filter.
- A created or rotated token appears once in a copyable banner with a warning.
- A process configured as an HTTP client of a remote store sees a read-only
  notice; tenant administration runs on the store host.

## Live evidence

`live-summary.txt`, `live-tenant-admin.json`, `tenants.png` and
`usage-audit.png` were captured with two production servers:

- **A** on `127.0.0.1:3010`, data dir `/tmp/of-tenant-admin-a`, shared SQLite at
  `/tmp/of-tenant-admin-data/responses.db`.
- **B** on `127.0.0.1:3011`, data dir `/tmp/of-tenant-admin-b`, HTTP client of A.

Flow:

1. A started with no tenant tokens; the admin API returned an empty registry.
2. Created `acme` (2 responses, 100 KB) and `globex` (10 responses, 100 KB);
   each create returned a raw token once.
3. B used the `acme` token, stored one response in A, and B had no local
   `responses.db`.
4. A reported `acme 1/2` and `globex 0/10`; the token list showed prefixes only.
5. A third response at quota 2 returned:

   ```
   429 {"error":{"message":"Tenant \"acme\" has reached its response quota (2).",
        "type":"quota_exceeded","code":"quota_exceeded"}}
   ```

6. Rotating the `acme` token changed the prefix from `ofst_yzIpY2r` to
   `ofst_lbst0Aq`. B's old token then returned
   `401 {"error":{"message":"Unauthorized","type":"authentication_error","code":"unauthorized"}}`;
   restarting B with the new token returned `200` and stored another response.
7. Disabling `globex` made its token return 401; re-enabling restored 200.
8. Lowering `acme` to a quota of 1 showed `over-quota` in the list; raising it
   back to 5 restored a usable quota.
9. Final state: `acme 4/5 near-quota`, `globex 0/10 active`, 4 responses,
   1,668 bytes. Audit actions included `tenant.create`, `tenant.update`,
   `tenant.rotate`, `tenant.disable`, `tenant.enable`, `save` and `save` for the
   client requests.

The screenshots show the tenant table and the usage/audit tab with the real
values above.

## Tests

`tests/response-tenant-admin.test.ts` (11 tests):

- create and list without exposing the raw token,
- token resolution and wrong-token rejection,
- duplicate names and invalid tokens,
- token rotation invalidating the old token,
- disable/re-enable,
- per-tenant usage (responses, bytes, owners),
- response quota enforcement and admin quota raise,
- aggregate totals for the billing view,
- admin audit actions and tenant isolation,
- delete refusal with history, purge, and the retained `tenant.delete` entry,
- one-time import of environment tenants and registry override on rotation,
- route mapping to `settings.read`/`settings.write` for every admin endpoint.

`tests/response-store-shared.test.ts` now also verifies that a `429` from the
remote store becomes `ResponseStoreQuotaError` and that a `401` preserves its
status.

The full Vitest suite is **217 passed with 1 skipped (37 files)**. The skipped
test is the gated MLX fine-tune.

## Limits

- Usage accounting is local: no payment provider, invoice, tax or subscription
  lifecycle.
- Quotas are response count and payload bytes, not request rate.
- The admin UI is available on the SQLite store host. An HTTP client process
  shows a read-only notice; it does not proxy administration to the host.
- Tokens are shown once. There is no token-recovery flow; rotate instead.
- The store server remains a single point of failure.
- Audit rows are not pruned or exported automatically.
