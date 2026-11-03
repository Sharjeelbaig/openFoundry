# Owner roles and IP-based trust

Status: clarification (egm-brainstorm Step 1). This is a working note, not a decision.

## Problem

In `Manage → Project details`, the block "My permission · Owner · Full access" and the
user table (role, access type, add user) present an access-control system. Nothing enforces
it: there is no sign-in and no management API checks a role. The runtime endpoints accept a
single project key or resource key.

The proposal under discussion: make identity real by tying it to IP addresses. The computer
running openFoundry is Owner; other people get Owner or another role based on their IP.

## What we established

- An IP address is an identifier, not a credential. It can be spoofed on a LAN, changes with
  DHCP, VPN and IPv6 privacy addresses, and is shared behind NAT.
- On the host, every process and OS user is `127.0.0.1`, so loopback cannot separate the
  person who installed the app from a colleague on the same machine.
- Device trust is a real pattern, but the proof is a secret or certificate (pairing code,
  mTLS, Tailscale identity), not a raw address.
- The design depends on the access scenario, and each scenario points at a different
  mechanism.

## Open question

What access scenario is this for?

- Several OS users on the same Mac: use the OS user identity.
- Teammates over the local network: use a pairing code or per-person token.
- Remote over VPN or Tailscale: use device identity or a token.
- Single-user local app: remove the roles UI.

## What Microsoft Foundry uses

- **Identity:** Microsoft Entra ID. Users, groups, service principals and managed identities
  are tenant identities. There is no role assignment by IP address.
- **Authorization:** Azure RBAC. A role assignment is a principal, a role and a scope. Scopes
  nest: subscription, resource group, Foundry resource, Foundry project, individual agent.
- **Roles (2026 names):** Foundry Agent Consumer (call agent endpoints only), Foundry User
  (build and test in a project), Foundry Project Manager (manage projects and assign Foundry
  User), Foundry Account Owner (manage accounts, projects and models, but not build in
  projects), Foundry Owner (full). Generic Azure Owner, Contributor and Reader also apply.
- **Two authentication modes:** Entra ID (RBAC roles are enforced) and API key (the key grants
  full access and the roles are bypassed). This is the critical detail: a single project key
  cannot express roles, because key auth skips the role check.
- **Management:** Foundry portal → Manage → Project details → Users → Add user, or Azure
  portal IAM / `az role assignment`.
- **Custom roles:** Azure custom role definitions with `Actions` and `DataActions`.

## Should we build a local Entra?

Verdict: do not clone Entra. Mirror the Foundry RBAC surface instead.

A full Entra clone fails the product test:

- Entra is an identity provider: OIDC and SAML, MFA, conditional access, B2B, PIM,
  provisioning, password reset. That is years of security-critical surface, not a feature.
- A homegrown identity provider on a network-exposed install turns every bug into an account
  takeover. Self-hosters who expose the app need a real IdP, not a simulation.
- Learners mostly need the Foundry part: principal, role, scope, and the Users tab. Entra
  internals are a different subject and would dilute the lesson.

What to mirror (Foundry-shaped, not Entra-shaped):

- A tenant record per workspace.
- Principals: user, group, service principal / managed identity.
- Role definitions: Foundry Agent Consumer, Foundry User, Foundry Project Manager, Foundry
  Account Owner, Foundry Owner, plus Azure Owner / Contributor / Reader.
- Assignments at workspace, project and agent scope.
- One authorization guard in front of every route, default deny.
- An audit log, and a "Check access" view that shows effective permissions.
- Bootstrap: the OS user running the app is the first Foundry Owner.

What to exclude:

- MFA, conditional access, B2B/B2C, PIM, SAML, SCIM, custom domains, password reset and
  email verification.

Naming: call it "Local directory" or "Workspace identity". Do not call it Entra; it is not
protocol-compatible, and the name would promise more than it delivers.

## Alternatives considered

The role table is the easy part. Identity is the hard part: a role only means something if
the server can name a trustworthy subject. These are the options, cheapest first.

| Option | What it proves | Cost | Use when |
| --- | --- | --- | --- |
| **No roles** — remove the permission UI | Nothing; one implicit owner | Lowest | The app is single-user and always will be |
| **Read-only share link** — tokenized URL with expiry | The holder may read and chat, not write | Low | You only need to show or demo the workspace to someone else |
| **Scoped access keys** — Admin / Editor / Viewer per key | The holder of this key may perform these actions | Medium | A small team, local or over LAN/Tailscale; no login UI |
| **Device pairing + session cookie** — one-time code exchanged for a token | This device was approved by the host | Medium-high | Non-technical teammates; you want revocation per device |
| **Local accounts + passwords** — named users, hashed credentials, signed sessions | This person authenticated | High | The product becomes a shared multi-user server |
| **Delegate to OIDC / Entra ID / Tailscale** | An external identity provider vouches for the person or device | High, and breaks "no cloud" | Org deployments behind an existing identity system |

The enabler for every real option is the same: **one authorization guard in front of every
route**, default deny, and an audit log. Without that, none of the options above are more
than a label.

### Leaning

For a local workbench, the honest range is the first three. A read-only share link covers
the common "show a colleague" case without inventing user accounts. Scoped access keys cover
a small team while keeping the local-first model. Local accounts and OIDC are a different
product: a shared server.

## How another person actually reaches the app

### Today: nobody can

The desktop build starts a Next.js server on a random port and binds it to loopback
(`src-tauri/src/lib.rs:96`, `HOSTNAME=127.0.0.1`), then points a webview window at
`http://127.0.0.1:<port>`. Only that machine can open it. There is no second client.

That is the structural reason the roles UI is fake: the architecture has no path for a
second person. Roles were written for a product shape the app does not have yet.

### The split that matters

openFoundry is a web app with a desktop wrapper, so there are two run modes with different
access models:

Rejected. Do not ship a mode selector, and do not hide features per mode. The product must be
one thing that grows to fit the install.

## One model, always on

The mistake is treating "local" and "hosted" as different products. They are the same product
at different sizes. So:

**Nothing is a mode. Everything is a property.**

| Concern | Not a mode | A property of the install |
| --- | --- | --- |
| Who can reach it | "local vs hosted" | The listen address (`HOST`) — loopback or a real interface |
| Who can sign in | "login on/off" | Which providers and principals exist |
| What they may do | "roles for teams" | Role assignments — always present, always checked |

### What is always true on every install

1. **The authorization guard runs on every route.** Default deny. No branch that turns it
   off for local use. A single-user install is not a different code path; it is the state
   where the principals table has one row and that row holds every scope.
2. **Principals and role assignments always exist** — user, group, service principal, and
   role at workspace / project / agent scope. One principal on day one, more later.
3. **Roles are always visible in the UI.** Hiding them in "local mode" would make the
   product two products and would hide the feature from the learner.
4. **Bootstrap creates exactly one owner** at install with Foundry Owner at workspace scope.
5. **Reachability is reported, not chosen.** The app shows "only this computer" or
   "reachable at 192.168.1.20:3000". If it is reachable beyond loopback and TLS is off, that
   is a warning with a fix, not a mode that needs selecting.

### How identity grows without a mode switch

A principal is added by the owner. Each principal has its own way of proving itself, chosen
per principal, not per install:

- **Machine credential** — the desktop shell holds a secret and presents it, so the person at
  that computer is the owner with no login screen. Real, not simulated: a remote request does
  not have the secret.
- **Passcode** — a per-person local credential, for a colleague with an OS account on the
  same machine or a browser elsewhere.
- **Personal key** — a scoped API key, for scripts and devices.
- **External provider** — an OIDC provider added once by the owner; each principal may be
  linked to it.

The login page lists whichever methods exist. It is not a switch: it renders what the
directory contains.

### Consequences

- A laptop install and a cafeteria install run identical code with identical checks.
- The learner sees the same Users / Roles / Check access surface as a self-hoster.
- Exposing the app is a config change with a safety warning, not a mode migration.
- The original problem — "Owner · Full access" enforced by nothing — is fixed at the root,
  because the guard is unconditional.

### The blocker to state plainly

Exposing openFoundry today is more dangerous than the fake roles are misleading: management
APIs are open, there is no TLS, and the project key is shown in the UI. Adding a login screen
on top of an unguarded API is decoration. The guard comes first, and it comes for everyone.

## Next

Decide how the bootstrap owner is proved: a secret the desktop shell holds, or a passcode set
on first run.

## Identity that mirrors Foundry without cloning Entra

### Why the UI does not have to change

The Users page is already Foundry-shaped. What is missing is the thing behind it. In Foundry
the portal never talks to Entra directly; it talks to the RBAC API — principals, role
definitions, role assignments, check access. Entra only supplies principals.

If openFoundry implements that same four-part interface, the page keeps its exact layout and
becomes true. No redesign, no new nouns.

| Foundry | openFoundry | Same UI? |
| --- | --- | --- |
| Entra principal (user / group / service principal) | Directory principal, identical kinds and fields | Yes |
| Role definition (Foundry Owner, Foundry User, Agent Consumer, …) | Same names, same permission sets | Yes |
| Role assignment: principal + role + scope | Same | Yes |
| Scope: account → project → agent | workspace → project → agent | Yes |
| Users → Add user → select role, select scope | Same dialog, same fields | Yes |
| Check access (effective permissions) | Computed from assignments, with inheritance shown | Yes |
| API key grants full access, RBAC bypassed | Same, and labelled the same way | Yes |
| Microsoft sign-in | Directory sign-in, or an OIDC provider if configured | Same shape |

The only difference between Foundry and openFoundry is **who holds the accounts**. Entra does
for Foundry; the local directory does for openFoundry.

### Bootstrap: proof of deployment control, never first arrival

"First browser to reach the setup page claims Owner" is rejected. It is a takeover race: the
first scan to find the port wins. Every real product solves this with a secret the installer
can see and the network cannot — Grafana's initial admin password, Jupyter's token, Jenkins'
initial password, Kubernetes' join token.

The rule: **the owner is whoever proves they control the deployment.**

1. **Bootstrap token** — on first start the server prints a one-time token to the console /
   log. Opening the app in a browser asks for it once. Redeeming it creates the owner
   principal and issues that person a credential. The token is then dead.
2. **Machine credential (desktop build)** — the Tauri shell holds a secret created at install
   and presents it, so the person at that computer is the owner with no prompt. A remote
   request does not have the secret, so it gets the token prompt instead. Real, not simulated.
3. **Deployment identity (later)** — on a cloud VM, the instance identity document (AWS IMDS,
   Azure managed identity, GCP metadata) can prove the process runs on the deployed machine.
   This is the closest honest analogue to "the resource owner deployed it". Phase 2.

### What actually gets built

- **Directory store** — `principals`, `credentials`, `roleDefinitions`, `roleAssignments`,
  `sessions`, `auditLog`. The role definitions and the Users page already exist; they gain a
  backing store.
- **One guard** — `can(session, action, scope)`, walking scope upward, default deny. Applied to
  every route, including the management APIs that are open today.
- **Computed permission display** — the "My permission · Owner · Full access" line becomes the
  result of the same function, with the reason (direct, inherited, via group). This is the
  single change visible on the page, and it makes the page honest instead of decorative.
- **A sign-in step that appears only when needed** — the desktop shell never triggers it. A
  browser without a session sees it once, exactly as the Foundry portal shows Microsoft
  sign-in.

### Where the line is: no password store

A per-person passcode means hashing, reset, lockout, and a password database — the first step
towards building the IdP that should not be built. So v1 proves a person with:

- **a credential string** (access key / token) that the browser stores in an HttpOnly session
  cookie, or
- **an OIDC provider** the owner adds once, if the deployment already has one.

Revocation is deleting the credential. There is nothing to leak, reset, or brute-force.

### Recommendation

One sign-in screen, one field:

> **Access code** `[ kf7q-9m2x-r4tp ]`  Sign in
> *— or —* Sign in with *<provider>* (only rendered when an OIDC provider is configured)

Why not a username:

- A username adds nothing the server does not already know. The code resolves to a
  principal, so the app shows "Signed in as Amina · Viewer" without the person typing a name.
- A password store brings reset, lockout, hashing, breach checks. With no mail server, reset
  becomes a manual support task — a dead end that looks like a feature.
- A high-entropy code cannot be brute-forced, so no lockout policy is needed: rate limiting
  covers it.
- Revoking is deleting a row, not chasing a password reset.

The code is short and grouped (`kf7q-9m2x-r4tp`), delivered by the owner as "Invite", and
carried in an HttpOnly cookie with a "remember this device" default. A QR or one-tap invite
link is delivery sugar over the same credential, not a different mechanism.

The choice is also reversible at low cost: adding an OIDC provider later changes the second
button, not the screen.

## UI parity contract

The Users surface already *is* the Foundry shape. Encode it as frozen, so the RBAC work
cannot drift the look.

### Frozen — do not change

Taken from `src/app/manage/page.tsx` as it stands today:

- Section order on Manage: Project details → **My permission** → tabs.
- Tabs, in order: **Users / Connected resources / Admin-connected models**.
- Users toolbar: `Search users` (max 360 px) on the left, **Add user** on the right.
- Table columns, in order and with their widths: **Name**, **Access type** (170), **Role**
  (150), **Scope**, **Added** (170), **Remove** (70).
- Name cell: initials avatar + name + email underneath.
- Access type cell: `badge gray`, value `Direct` or `Inherited`.
- Role cell: dropdown with **Owner / Contributor / Reader** (Azure role names, which Foundry
  also shows), disabled for the last remaining Owner.
- Scope cell: monospace `resourceGroup/projects/projectName` + copy button.
- Footer left: `N project users`.
- Add user dialog: title **Add user**, `aria-label="Add project user"`, fields **Name**,
  **Email**, **Role**, footer **Cancel** / **Add user**.

These labels, columns, order and widths are not to be touched. No new column, no renamed
heading, no new tab, no new page under Manage.

### The only permitted deltas, each with a Foundry precedent

1. **The permission line becomes computed.** Same markup, same format
   (`<dot> Owner · Full access`). The value now comes from the guard, and a Reader reads
   `Reader · Read only`. Foundry computes this too; ours stops being a constant string.
2. **Add user dialog subtitle becomes true.** Today it says roles are informational. It should
   say what happens: the person is added to the project and gets an access code. After Add,
   the code appears inside the same dialog body as one line with a **Copy** button. No new
   page, no second dialog. Foundry's add flow also ends in a result state.
3. **The Remove cell gains a `…` menu.** Same cell, no new column. Items: *Issue new access
   code* and *Sign out everywhere*. Precedent: the app already ships
   `aria-label="Actions for X"` row menus, and Foundry's tables use row `…` menus. Width may
   go 70 → 96 if two icons do not fit.
4. **Footer right side becomes true.** The sentence "no sign-in provider is configured" is
   replaced by what is actually true ("Signed in with access code", "3 principals"). Copy
   only.

### Forbidden — these are the drifts

- No **Access codes** page or tab. Foundry has no such surface; the credential lives on the
  principal, and the principal lives in this table.
- No password / reset / change-password screens.
- No **identity provider** settings page in v1. An OIDC provider is configured by file or
  environment variable, the way a Foundry deployment is configured by `az`. Adding it later
  can reuse the existing Settings blocks.
- No second user-management surface anywhere else in the app.
- No change to the sign-in *shape*: one route outside the app shell, centered card, same
  type scale and controls. It is the analogue of `login.microsoftonline.com`, which is also
  outside the Foundry portal.

### Revision: new screens are allowed, invented layouts are not

The original rule above ("no new page") is too strict. The real rule is about provenance,
not count:

1. **If Foundry has the surface, copy Foundry.** Same title, same field order, same button
   placement, same labels. Capture it from the live portal, not from memory.
2. **If Foundry has no such surface**, reuse the closest Foundry pattern rather than invent a
   new one. Credentials reuse the **Keys and endpoints** blade; confirmations reuse the
   standard dialog; pickers reuse the existing role dropdown.
3. **Never invent a layout for something Foundry already renders.** That is the drift.

Every new screen therefore needs a reference: a screenshot plus the DOM of the Foundry page
it mirrors. That reference is captured from the signed-in portal over CDP and stored beside
the design doc.

Source of truth is the live portal, not documentation screenshots, which lag the product.

## What the live portal actually does

Captured 4 Nov 2026 from the signed-in tenant. Full measurement, screenshots and tokens:
`docs/designs/foundry-ui-reference/`.

Three findings change the plan:

1. **The Add user dialog has no role picker.** It has one field, `Add people`, a combobox. The
   banner says Reader and Foundry User are assigned automatically and that fine-grained control
   happens in the Azure portal. So role assignment is not part of adding a person — it is a
   separate surface. openFoundry's current dialog (Name / Email / Role) is the drift.
2. **The Users table has four columns, not six**: Name, Access type, Role, Scope. No `Added`, no
   `Remove`. Role is plain text, not a dropdown. Scope is a purple link, not monospace.
3. **`My permission` is computed in Foundry too** — a green dot and `Owner · Full access`. So
   computing it locally is parity, not a new idea.

Consequence: mirroring Foundry means the role control has to move out of both the table and the
Add user dialog. That needs one new surface, and Foundry has a known pattern for it: the
"Choose a connection" sheet — a full-height sheet of grouped, two-column option cards with a
single `Continue` in the footer. A role/scope chooser built that way is Foundry-shaped without
inventing anything.





