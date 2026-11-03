# Local RBAC: directory, sessions and role assignment

Status: implemented. What exists, and what is still open, is listed at the end.
Supersedes the role-assignment part of `roles-ip-brainstorm.md`.
Reference for every screen named here: `foundry-ui-reference/`.

## The problem

The Users page records people and roles that nothing reads. `src/lib/auth.ts` only verifies the
project API key; the internal `/api/*` routes accept any request from anyone who can reach the
port. A `Reader` can deploy a model. `My permission` is the string `Owner · Full access`,
hardcoded in `src/app/manage/page.tsx`.

That is the decorative part. This design makes roles do work.

## Non-goals

- No identity provider. No passwords, no reset flow, no OIDC in this phase.
- No groups, no conditions, no deny assignments, no custom role editor.
- No cloud tenancy. Scope has two levels: this install, and the one project.
- No email delivery. An access code is handed over out of band.

## Shape of the model

One model for every deployment. There is no "mode" flag and no branch:

```
every request ──► session? ──no──► sign-in (access code, or machine credential)
                    │
                   yes
                    ▼
             can(session, action, scope) ──no──► 403 + audit row
                    │
                   yes
                    ▼
                  handler
```

A single-user install is a directory with one principal and one assignment. A café install is the
same directory with more rows. Nothing is hidden when there is only one user.

## Directory

`directory.json` in the data directory, written atomically with the existing `writeJson` helper
(tmp file, then rename). A process-wide mutex serialises read-modify-write, because two concurrent
assignment requests would otherwise lose one.

```ts
type PrincipalKind = "user" | "service";

interface Principal {
  id: string;              // usr_XXXXXXXX
  kind: PrincipalKind;
  name: string;
  email: string;           // lowercased; the unique key
  initials: string;
  createdAt: string;
  disabledAt?: string;
}

type CredentialKind = "access_code" | "machine" | "api_key";

interface Credential {
  id: string;              // cred_XXXXXXXX
  principalId: string;
  kind: CredentialKind;
  lookup: string;          // first 4 chars of an access code, or "machine"
  salt: string;            // 16 random bytes, base64
  hash: string;            // sha256(salt + normalizedSecret), hex
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

interface RoleDefinition {
  id: string;              // role_owner
  name: string;            // "Owner"
  description: string;     // shown in the wizard, derived from actions
  actions: string[];       // ["*"] or ["*.read", "models.invoke"]
  builtIn: true;
}

interface Assignment {
  id: string;              // asg_XXXXXXXX
  principalId: string;
  roleId: string;
  scope: string;           // "/" or "/projects/<projectId>"
  description?: string;
  createdAt: string;
  createdBy: string;       // principal id
}

interface Session {
  id: string;              // ses_XXXXXXXX, the cookie value
  principalId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string;
  address: string;
}

interface AuditEvent {
  at: string;
  actorId: string | null;
  action: string;          // "assignment.create", "auth.sign_in", "auth.denied"
  target: string;          // assignment id, principal id, route
  scope?: string;
  outcome: "allowed" | "denied" | "failed";
  detail?: string;
}
```

Why role _definitions_ and not an enum: the wizard has to print a description and a permission
list for each role (`Details → View` in step 1). If the description is a constant next to an enum,
it will drift from what the guard actually checks. It is generated from `actions` instead.

Why `lookup` is stored in clear: sign-in must find the credential by the first four characters
without scanning and hashing every row. The remaining 16 characters (80 bits) are the secret.

Session ids and access codes are high-entropy, so sha256 with a per-credential salt is enough;
there is no low-entropy password to slow a brute force against. Rate limiting handles guessing.

## Roles

Four built-in roles. The names are Foundry's, so they read the same in the UI.

| Role | Actions | Description shown in the wizard |
| --- | --- | --- |
| Owner | `*` | Full access to this install, including users, access codes and role assignments. |
| Contributor | `*` except `directory.*`, `settings.write` | Create and manage models, agents, knowledge, tools and connections. Cannot change access or project identity. |
| Foundry User | `*.read`, `models.invoke`, `agents.invoke`, `tools.invoke`, `chat.use` | Use models and agents and read the project. Cannot create or change anything. |
| Reader | `*.read` | View the project and its resources. Cannot run models or agents. |

`Owner` and `Contributor` being close is intentional; the difference is access control, which is
exactly the line Foundry draws between subscription Owner and Contributor.

### Action catalogue

Every action is backed by a real route. `.read` covers `GET`, `.write` covers the rest unless a
narrower action exists.

| Resource | Actions | Representative routes |
| --- | --- | --- |
| project | `project.read` | `GET /api/settings` (identity fields) |
| models | `models.read`, `models.download`, `models.deploy`, `models.delete`, `models.invoke` | `/api/models`, `/api/models/download`, `/api/deployments`, `/api/v1/chat/completions` |
| agents | `agents.read`, `agents.write`, `agents.invoke` | `/api/agents`, `/api/projects/[project]/agents/...` |
| knowledge | `knowledge.read`, `knowledge.write` | `/api/knowledge`, `/api/knowledge/search` |
| tools | `tools.read`, `tools.write`, `tools.invoke` | `/api/toolboxes`, `/api/mcp`, `/api/http-tools`, `/api/tools/catalog` |
| workflows | `workflows.read`, `workflows.write` | `/api/workflows/...` |
| routines | `routines.read`, `routines.write` | `/api/routines/...` |
| evaluations | `evaluations.read`, `evaluations.write` | `/api/evaluations` |
| guardrails | `guardrails.read`, `guardrails.write` | `/api/guardrails` |
| memory | `memory.read`, `memory.write` | `/api/memory` |
| gateway | `gateway.read`, `gateway.write` | `/api/gateway/...` |
| connections | `connections.read`, `connections.write` | `/api/connections`, `/api/oauth/...` |
| runtimes | `runtimes.read`, `runtimes.write` | `/api/nodes` |
| quota | `quota.read`, `quota.write` | `/api/quota-requests` |
| skills | `skills.read`, `skills.write` | `/api/skills` |
| traces | `traces.read` | `GET /api/traces` |
| export | `export.write` | `/api/export` |
| system | `system.read` | `GET /api/system` |
| chat | `chat.use` | `/api/chat`, `/api/batch` |
| settings | `settings.read`, `settings.write` | `/api/settings` |
| directory | `directory.read`, `directory.write` | `/api/directory/...` |

Matching rules:

- `*` matches every action.
- `<resource>.*` matches every action of that resource.
- Otherwise exact string equality.
- No deny rules. A missing grant is a denial; that is the whole rule set, and it is why the
  resolution table below is short enough to test exhaustively.

### `can()`

```ts
can(subject: { principalId: string }, action: string, scope: string):
  { allowed: boolean; reason: "granted" | "no_grant" | "out_of_scope" | "disabled" }
```

1. If the principal is disabled → `false`.
2. Collect assignments where `assignment.scope` is an ancestor of the requested scope (`/` is an
   ancestor of everything).
3. Union the actions of their roles.
4. Match the requested action against the union.

This is 40 lines and a table test. It does not need a policy engine.

## Credentials

### Access code

Format: 16 characters from Crockford base32 (no `I`, `L`, `O`, `U`), in four groups:
`7Q4M-XR2A-K9WP-3FJH`. 80 bits.

- Input is normalised before hashing: uppercase, strip non-alphanumerics, `O`→`0`, `I`/`L`→`1`,
  `U`→`V`.
- Issued for one principal, shown once, never recoverable.
- Revocable. Revoking kills every session issued with it.
- Stored as salt + sha256, with the first four characters in clear for lookup.

### Sign-in

`POST /api/auth/sign-in { code }`:

1. Rate limit: 10 attempts per minute per address, 100 per hour per install. Exceeding returns the
   same generic error, with a `Retry-After`.
2. Look up by the 4-character prefix, verify the hash with `timingSafeEqual`.
3. On success: create a session, set `of_session` (HttpOnly, SameSite=Lax, Path=/, Secure when the
   request arrived over https, 30 days), update `lastUsedAt`, write an audit row.
4. On failure: one message — "That access code is not valid." — a delay of 250 ms, an audit row.
   No distinction between unknown code, revoked code and expired code.

`POST /api/auth/sign-out` deletes the session row and clears the cookie.

### Machine credential

`machine.key` in the data directory: 32 random bytes, base64url, mode 0600. The **server**
generates it on first start (`ensureMachineKey`), because it is the side that owns the data
directory; the desktop shell only reads it.

At launch the shell opens `http://127.0.0.1:<port>/api/auth/machine?key=<key>`. The server accepts
it **only when the request arrives on loopback**, creates a session for the local principal (or
claims the install on first run, using the identity from setup), and 302s to `/`. The key never
appears in a page or a log.

This is proof of deployment control: to obtain the key you must already be able to read the data
directory as the OS user.

### Bootstrap token

When the directory has no Owner and no machine credential has been used, the server prints, on
every start:

```
openFoundry has no owner yet.
Open http://<host>:<port>/setup and enter this one-time token:
  K3M9-P2XA-7QRT
```

- Same alphabet, three groups, 60 bits, 24 hours, single use.
- Stored in clear in `bootstrap.json` (mode 0600) rather than only as a hash, so a restart reprints
  the same unclaimed token instead of invalidating the one being typed. The file is the secret;
  hashing it would not add a boundary the data directory does not already cross.
- A restart does not invalidate an unclaimed, unexpired token. Claiming it does.
- Claiming it creates the Owner principal, its access code, and a root assignment.
- `/setup` asks for the token only when the request has no session and the install is unclaimed.
  The desktop never sees this step.

This is the part that kills the takeover race: the first browser to reach the port cannot claim
anything without a secret that only the operator can see.

### Recovery

`npm run access-code` mints a new code for the owner and prints it. It reads and writes
`directory.json` directly, so it requires the filesystem access the server already has. Use it when
the only owner has lost their code; it is also how a development build signs in.

## Enforcement

### One table, fail closed

`src/lib/directory/routes.ts` maps `(method, path)` to an action. `src/proxy.ts` checks it before
any route handler runs.

The alternative — one wrapper per exported handler — was rejected during implementation. With 64
route files, a forgotten wrapper leaves a route open and nothing notices. A table fails closed: a
route that is not listed is denied, and the test suite walks `src/app/api` and fails if any real
route is unmapped. Forgetting to update the table breaks the build, not the security.

Proxy runs on the Node runtime and reads `directory.json` directly. It costs one small file read
per request; the app already reads `settings.json` several times per page.

Every action is checked at the project scope, except `settings.write`, which belongs to the
install. Changing a root-scope assignment needs root `directory.write`, so the assignment routes
check the target assignment's own scope in addition to the proxy check. That is what keeps a
project Owner able to manage their project without letting them grant access to every project.

```ts
const route = resolveApiRoute(request.method, pathname);
if (route.visibility === "public") return NextResponse.next();
if (route.visibility === "unmapped") return jsonError(403, "unmapped_route", ...);
if (!session) return jsonError(401, "no_session", ...);
if (!can(directory, session.principalId, route.action, scope).allowed) {
  return jsonError(403, "insufficient_permissions", ...);
}
```

### Which routes

| Group | Guard |
| --- | --- |
| `/api/v1/*`, `/api/projects/*/openai/*`, `/api/gateway/v1/*` | unchanged: API key. The key maps to a service principal in a later phase. |
| `/api/auth/*`, `/api/oauth/callback`, `/api/routine-events/*` | unauthenticated by design; each authenticates itself |
| everything else under `/api` | the action in `routes.ts` |

The completion criterion is mechanical: a Reader session must receive 403 from every mutating
route in `src/app/api`. `tests/directory/routes.test.ts` walks the route files and asserts every
exported method resolves to a rule.

### Pages

Pages are server components and can call `can()` directly. Rules:

- Hide a control you cannot use (`Add user`, `Add role assignment`, `Delete`).
- A disabled control is acceptable only when the reason is permanent and visible: a Reader sees
  `Add role assignment` disabled with a tooltip, exactly as the portal disables `Add user` at a
  scope where it cannot add. The `Conditions` tab follows the same rule: it stays in the tab strip,
  disabled, because it is part of the flow learners will meet and will be filled in when custom
  conditions exist.
- Always enforce at the API as well. Hiding is not security; it is honesty.

`layout.tsx` resolves the session and passes the principal to `AppShell`, so the header shows the
signed-in person rather than `settings.userName`.

## Access control page

Route `/manage/access`. This is the local equivalent of the Azure portal IAM page that Foundry's
`Scope` link opens. It exists because role assignment needs a surface, and Foundry does not render
one — inventing a fourth tab inside the Users page would be drift.

Layout, from `11-iam-role-assignments.png`, skinned with Foundry tokens:

- Breadcrumb `Manage / Access control (IAM)`, title `<resourceName> | Access control (IAM)`.
- Command row: `Add role assignment` (primary pill), `Refresh`, `Delete` (enabled only with a
  selection).
- Tabs: `Role assignments` | `Roles` | `Access codes`.
- Filters: search `Search by name or email`, `Role: All`, `Scope: All`.
- Grid: checkbox, `Name` (avatar, name, email), `Role`, `Scope` (link, with `(Inherited)` when the
  assignment sits at `/`), `Added`.
- Rows grouped by role with a collapsible header carrying the count, as the portal does.
- Footer `Showing 1–N of N results` plus paging.
- Empty state: "No role assignments. Add role assignment to grant access."

Deliberate omissions, each because the underlying thing does not exist here: `Download role
assignments`, `Edit columns`, `Type` filter, `Group by`, `Condition` column, the
`Job function / Privileged administrator` sub-tabs, and the `Check access` / `Deny assignments`
tabs. A control that cannot do anything is worse than a missing control.

### Roles tab

Read-only list of the four role definitions: name, description, actions. This is where "what does
Contributor actually allow" is answered, and it is generated from the same array the guard uses.
It cannot go stale.

### Access codes tab

The only local-only addition, and it has to exist: a person who loses their code needs a new one.

- Grid of principals: name, email, credential state (`Active`, `Never signed in`, `Revoked`),
  last used.
- Row action `Issue code` → creates a credential, shows the code once in a dialog with `Copy`.
  The old credential is revoked on the same call, so there is never more than one live code per
  person.
- `Revoke` removes every session for that principal.

## Add role assignment

Route `/manage/access/assign`. A full page, not a dialog, because that is what the reference does
(`12`–`16`).

- Header: `Add role assignment`, close `×` at the far right.
- Four tabs: `Role*`, `Members*`, `Conditions*`, `Review + assign*`.
- `Conditions` is permanently disabled. In the reference it is disabled per role (`Reader` cannot
  carry conditions), and nothing here supports them. A disabled tab with no way to enable it is
  normally a lie; here it is an accurate statement that conditions are not part of this product,
  and it is worth a note in the UI: "Conditions are not supported in a local install."

### Step 1 — Role

- Lead line, verbatim from the reference: "A role definition is a collection of permissions. You
  can use the built-in roles or you can create your own custom roles." The second sentence has to
  go: there is no custom role editor. Use: "A role definition is a collection of permissions.
  These are the built-in roles for this install."
- Table: `Name`, `Description`, `Type` (`BuiltInRole`), `Category` (`General`), `Details` (`View`).
- `View` opens a side pane listing the role's actions, grouped by resource. This is the only place
  where the guard's vocabulary is shown to a user, and it is generated from `roles.ts`.
- Single selection. `Next` enables on selection.
- Footer: `Review + assign` (primary, disabled), `Previous` (disabled — this is step 1),
  `Next`.

Do not reproduce the portal's `Type`/`Category` filters or the `Copilot can help pick a role`
affordance: with four roles they filter nothing and the second does not exist.

### Step 2 — Members

- `Selected role` — read-only value.
- `Assign access to` radios: `User, group, or service principal` (selected) and `Managed identity`
  (disabled, with the reason "Managed identities are not available in a local install").
- `Members` row with `+ Select members`, then the grid `Name / Object ID / Type`, empty state
  `No members selected`.
- `Description` textarea, placeholder `Optional`, stored on the assignment.
- `Select members` opens a right-side pane: search `Search by name or email address`, list of
  principals (avatar, name, email), multi-select. Chosen entries move to `Selected members:` on the
  right half. Footer `Select` and `Close`. Empty copy verbatim.
- Multi-select matters: assigning a role to five people is one trip through the wizard.

### Step 3 — Review + assign

- Read-only rows: `Role`, `Scope`, `Members` (Name / Object ID / Type grid), `Description`
  (`No description` when empty).
- `Scope` shows the human path, not a GUID: `<resourceName>` or `<resourceName>/<projectName>`.
- Footer: `Review + assign` (primary, enabled), `Previous`, `Next` (disabled).
- Submit writes one assignment per selected member in a single directory write, plus an audit row
  each, then navigates to `/manage/access` with a toast.

## Users page, after this change

`src/app/manage/page.tsx` loses four things and gains one.

Removed, because Foundry does not have them:

| Removed | Replacement |
| --- | --- |
| `Added` and `Remove` columns | none; the row's role is edited on the access page |
| Role dropdown in the table | plain text |
| `Name` / `Email` / `Role` dialog | `Add people` combobox |
| `N project users` footer | `1–3 of 3` + Prev/Next |
| Monospace scope + copy button | purple link + external icon, to `/manage/access?scope=…` |

Kept and corrected: the `My permission` line becomes computed. `describeAccess(actions)` returns
`Full access`, `Full access except access control`, `Read and use`, `Read-only access` or
`Custom access`; the line renders `<role> · <that>`. Founder's is `<strong>Owner</strong> ·
Full access` with a green dot; the dot only appears when the session's actions include `*`.

The Add user dialog:

- One field, `Add people *`, a combobox over principals. Typing an unknown email offers
  `Invite <email>`.
- Banner, adapted from the reference: `"Reader" and "Foundry User" roles will be assigned to this
  user. To assign fine-grained access control, use Access control (IAM).` The reference's first
  sentence ("This user will have full access…") is dropped — it contradicts the roles it assigns,
  which is the exact thing this work is removing.
- On submit: create the principal if new, create the two assignments at project scope, and if the
  principal has no live credential, issue one.
- Success state in the same dialog: the person, the two roles, and the access code with `Copy` and
  "This code is shown once." `Done` closes. This is the only addition to the reference's dialog,
  and it exists because Entra is not here to deliver the identity.

## First run

`/setup` gains one step between `Profile` and `Providers`, shown only when it is needed:

- **Directory has an Owner, session present** — step skipped.
- **Desktop, no Owner** — step says "This computer is signed in automatically" and shows nothing
  to type. The machine credential already claims ownership.
- **Server, no Owner** — asks for the one-time token printed on the console, then creates the
  Owner and shows the access code with `Copy`.

After the Owner exists, `/setup` requires a session; it is no longer reachable anonymously.

`src/app/signin/page.tsx` is a new screen and has no Foundry equivalent, because Foundry delegates
sign-in to Entra. Keep it plain: product name, one labeled field, one primary button, one error
line. Do not dress it as a Microsoft sign-in page.

Routing when unauthenticated:

| Request | Redirect |
| --- | --- |
| `/signin` | render |
| `/setup` | render if no Owner, else `/signin` |
| everything else | `/signin?next=<path>` |

## Migration from `settings.users`

On first boot with no `directory.json`:

1. Each `settings.users` row becomes a principal (`kind: "user"`), except the seeded row that
   matches `settings.userEmail` with role `Owner`. That row is this computer's own identity, not a
   person somebody added: it is claimed by the machine credential (desktop) or the setup token
   (server), so a fresh install is never "already claimed" by a placeholder.
2. Each becomes an assignment at `/` with its existing role (`Owner`, `Contributor`, `Reader`).
   Roles with no actions (`Reader` here) get the real definition, so their permissions change from
   unbounded to read-only. That is the point.
3. `profiles` with `accessType: "Inherited access"` are still converted; access type becomes
   derived from the scope, not stored.
4. Every principal is left with no credential. The local OS user is signed in by the machine
   credential; anyone else needs an Owner to issue a code on the Access codes tab.
5. `settings.users` stays in the file, unread, until a later cleanup. `src/app/api/users/route.ts`
   is deleted and its callers moved to `/api/directory/*`.

`settings.userName` / `userInitials` stay as the display identity for a signed-out page; once a
session exists the principal wins.

## What is enforced, and what still is not

Enforced after this work:

- Every internal `/api` route requires a session and an action grant.
- Role assignment, code issuance and code revocation require `directory.write`.
- The last principal holding `directory.write` cannot be demoted or removed.
- Sign-in failures are rate limited and audited.
- Every denial is audited with actor, action and scope.

Still not:

- `/api/v1/*` still accepts the project API key with no principal attached. Phase 3 maps that key
  to a service principal with `models.invoke`. Until then, document it as an API surface outside
  the directory.
- `routine-events/[token]` is authenticated by a per-routine token, not a session. Scheduled work
  has to run without a user; that is correct, and it is why the route is excluded.
- No encryption at rest. Access code hashes and session ids sit in plain JSON next to the rest of
  the data directory. File permissions are the control.
- No CSRF tokens. `SameSite=Lax` plus JSON-only bodies plus no state-changing `GET` is the
  mitigation; a hostile page cannot read the response.

## Tests

`tests/directory/`, 36 assertions, all green.

| File | Covers |
| --- | --- |
| `can.test.ts` | truth table for all four roles; wildcards `*`, `*.read`, `models.*`; read does not imply write; project vs root scope; prefix collisions (`/projects/abc` vs `/projects/abcd`); role union; disabled principal; `summaryFor` picks the highest role; `describeAccess` for each built-in role |
| `codes.test.ts` | code shape, Crockford alphabet, normalisation of every confusing character, salting, verify right/wrong |
| `routes.test.ts` | every real route file resolves to a rule; unknown paths and unknown methods are denied; read and write methods map differently; API-key surfaces are public on purpose |
| `store.test.ts` | migration skips the seeded local identity; mutex under 20 concurrent writers; bootstrap token single use, reprinted across restarts, and a directory with no owner is recognised |

Not covered yet, and this is a real gap: an HTTP-level test that signs in and asserts 403 per
route (the table test proves the mapping, not the wiring), and a test for the last-owner rule at
the API boundary. Both need a running server, so they belong in a separate smoke suite.

## What exists

- `src/lib/directory/` — types, roles, `can()`, codes, sessions, audit, rate limit, route table,
  bootstrap and machine credentials, migration, store with a write mutex.
- `src/proxy.ts` — session and action gate for every page and every mapped API route.
- `/signin`, the setup claim step, sign-out in the profile menu, the real `My permission` line.
- `/manage/access` — role assignments grouped by role, Roles, Access codes.
- `/manage/access/assign` — `Role → Members → Conditions (disabled) → Review + assign`.
- The Users page: four columns, no row actions, `Add people` dialog, access code on invite.
- `npm run access-code` — owner recovery from the shell.
- The desktop shell reads `machine.key` and signs in through `/api/auth/machine`.

## Still open

- `/api/v1/*`, `/api/projects/*/openai/*` and `/api/gateway/v1/*` still accept an API key with no
  principal. Phase 3 maps that key to a service principal with `models.invoke`.
- No groups. A role is assigned to one person at a time.
- No conditions and no deny assignments; the tab is present and disabled.
- Scope has two levels and one project, so the Scope column mostly shows the direct/inherited
  distinction. It is kept because it is the column Foundry shows and because a second project
  makes it meaningful without a migration.
- No CSRF tokens: `SameSite=Lax`, JSON bodies and no state-changing `GET` are the mitigation.
- Session records are not encrypted at rest; the data directory's permissions are the control.

## Done when

A Reader session can read the app and cannot change anything; a second person can be invited,
receives a code, signs in, and sees a different role; every one of those steps is in
`audit.jsonl`; and the Users page has the same four columns as `01-users-project.png`.
