# Microsoft Foundry UI reference

Captured from the live portal on 4 November 2026, signed in as the tenant owner.

- Tenant `aa0c7999-52b1-4ab6-b71a-e5f91e0b475b`, project `shazi-learn`, resource `shazi-learn-resource`.
- Captured over Chrome DevTools Protocol at a 1600 x 845 CSS-pixel viewport, device pixel ratio 2.
- Screenshots are therefore 3200 x 1690. All numbers in this document are **CSS pixels**, taken
  from `getComputedStyle` and `getBoundingClientRect`, not measured by eye.
- Source of truth is the running product. Documentation screenshots lag the portal.

## Screens

| File | Screen |
| --- | --- |
| `01-users-project.png` | Manage → Project details → Users |
| `02-add-user-dialog.png` | Add user dialog, empty state |
| `03-people-picker.png` | People picker open, "No options available" |
| `04-connected-resources.png` | Project details → Connected resources |
| `05-admin-connected-models.png` | Project details → Admin-connected models |
| `06-resource-details.png` | Resource details → Projects |
| `07-users-resource.png` | Resource details → Users (same table as project scope) |
| `08-quota.png` | Quota → Token per minute |
| `09-ai-gateway.png` | AI Gateway → empty state |
| `10-choose-connection.png` | Add connection → "Choose a connection" sheet |
| `11-iam-role-assignments.png` | Azure IAM → Role assignments, grouped by role |
| `12-iam-step1-role.png` | Add role assignment → step 1, Role |
| `13-iam-step2-members.png` | Add role assignment → step 2, Members |
| `14-iam-select-members.png` | Members → "Select members" context pane |
| `15-iam-members-added.png` | Members step with a member attached |
| `16-iam-review-assign.png` | Add role assignment → step 4, Review + assign |

Screens `01`–`10` are Microsoft Foundry. Screens `11`–`16` are the Azure portal, which Foundry
hands role assignment to. The portal screens were captured in the account's dark theme: **copy the
structure and wording, not the colours.** The light palette for a local port lives in
`01-users-project.png`.

## Measured tokens

### Typography

| Role | Value |
| --- | --- |
| Font family | `Aptos` (Fluent v9 default; falls back to Segoe UI) |
| Page title (h1) | 20px / 28px, weight 600, `#242424` |
| Section title ("Project details", "My permission") | 20px / 20px, weight 700 |
| Body | 14px / 20px, weight 400, `#242424` |
| Table row text | 14px / 20px, `#424242` |
| Field label | 12px / 16px, `#616161` |
| Badge text | 10px / 14px, weight 600, `#616161` |
| Tag ("Default project") | 12px / 16px, weight 600, `#616161` |

### Colour

| Token | Value | Used for |
| --- | --- | --- |
| Text primary | `#242424` | headings, body |
| Text secondary | `#616161` | labels, badges |
| Text row | `#424242` | table cells |
| Link / accent | `#8251EE` | scope links, inline links |
| Tab indicator | `#9263F1` | active tab underline, 2px |
| Primary button | `#553695` | filled pill, white text |
| Border | `#E0E0E0` | cards, table dividers, badges |
| Input fill | `#F5F5F5` | search, combobox, dialog input |
| Disabled fill | `#F0F0F0` / text `#BDBDBD` | disabled primary |
| App rail | `#F0F0F0` | left navigation background |
| Surface | `#FFFFFF` | main content |
| Tag fill | `#EBEBEB` | "Default project" |

### Geometry

| Element | Value |
| --- | --- |
| Top bar height | 48 |
| Left rail width | 236 |
| Card / dialog radius | 8 |
| Input radius | 4 |
| Badge radius | 2 |
| Buttons | 32 high, pill (`border-radius: 10000px`), padding 5px 12px, weight 600 |
| Search field | 320 x 32, fill `#F5F5F5`, radius 8, 16px icon, 8px gap |
| Dialog | 570 x 300 at 1600 wide, padding 16px 24px |
| Dialog shadow | `0 0 8px rgba(0,0,0,.12), 0 32px 64px rgba(0,0,0,.14)` |
| Table header row | 32 |
| Table body row | 44–45 |
| Table cell padding | `0 8px 0 16px` |

### Users table column widths at 1332px card width

| Column | Width |
| --- | --- |
| Name | 339 |
| Access type | 331 |
| Role | 331 |
| Scope | 331 |

Name carries the avatar and two lines; the other three are equal thirds.

## Screen specs

### Users (project and resource scope are identical)

- Header row: back arrow, project name (h1), tag `Default project`, overflow `…` at far right.
- "Project details" collapsible block: four columns of label/value pairs. Labels 12/16 `#616161`;
  values 14/20 `#242424`. Endpoint and API key have copy and reveal buttons, 32 x 32.
- "My permission" collapsible block: a green dot, `Owner`, then `· Full access` in secondary text.
- Tabs: `Users`, `Connected resources`, `Admin-connected models`. 14/20, 32 high, padding 6,
  active tab has a purple underline, inactive text `#424242`.
- Toolbar: search left (placeholder `Search`), one pill button far right.
- Button state is meaningful: **`Add connection` is `#553695` (enabled), `Add user` is white with a
  `#D1D1D1` border** because the permission is inherited at this scope and adding is not allowed.
  A disabled primary is `#F0F0F0` with `#BDBDBD` text.
- Table: no border on the outer card except `1px #E0E0E0` and radius 8. Header text is plain
  `#242424`. Rows are divided by `1px #E0E0E0`. There is **no zebra striping**.
- Name cell: 32px circular avatar with initials, name 14/20 `#242424`, email 12/16 `#616161`.
- Access type cell: `Inherited access` text plus a `View only` badge (2px radius, 1px `#E0E0E0`,
  10/14 weight 600).
- Role cell: **plain text**, not a control.
- Scope cell: purple link `#8251EE` with a 12px external-link icon. Long scopes wrap to two lines.
- Footer: `1-3 of 3` at the left; `Prev` and `Next` with chevrons at the right, disabled at `#BDBDBD`.
- There is **no row action menu and no Remove control**.

### Add user dialog

- 570 wide, 300 tall, radius 8, padding 16/24, two-layer shadow, close `X` 32 x 32 top right.
- Title: `Add user`, 20/28 weight 600.
- Field: label `Add people` (14/20) with a red `*`. Control is a **combobox, 520 x 34**, fill
  `#F5F5F5`, radius 4, placeholder `Enter name`, chevron at the right.
- Info banner below the field: grey panel with an `i` icon, body copy, and its own dismiss `X`.
- Footer, right aligned: `Add user` (primary, disabled until a person is picked: `#F0F0F0`,
  text `#BDBDBD`) then `Cancel` (white, `1px #D1D1D1`).
- **There is no role selector.** The banner states that `Reader` and `Foundry User` are assigned
  automatically and that fine-grained control happens in the Azure portal.

### Choose a connection sheet

- Full-height sheet, two columns of option cards.
- Grouped by section headings (`Other resource types`, `Azure AI`, `Data`, `Agent Knowledge Tools`).
- Card: icon 32, title 14 weight 600, subtitle 12 `#616161`, radius 8, 1px border, 32px inner padding.
- Footer: a single primary `Continue`, disabled until a card is selected.

### Azure IAM: Role assignments

This is the surface Foundry's `Scope` link opens, and the one that actually edits roles.

- Breadcrumb `Home > <resource>`, page title `<resource name> | Access control (IAM)`.
- Commands above the tabs: `Add`, `Download role assignments`, `Edit columns`, `Refresh`, `Delete`.
- Tabs: `Check access`, `Role assignments`, `Roles`, `Deny assignments`.
- Filters above the grid, in this order: search `Search by name or email`, then `Type: All`,
  `Role: All`, `Scope: All scopes`, `Group by: Role`.
- Sub-tabs: `All (3)`, `Job function roles (2)`, `Privileged administrator roles (1)` — the counts
  are part of the label.
- Grid columns: checkbox, `Name`, `Type`, `Role`, `Scope`, `Condition`. Sortable headers.
- Rows are **grouped by role** with a collapsible header `Owner (1)`, `Foundry User (2)`.
  The Name cell is avatar + display name + object ID on a second line.
- `Scope` is a link rendered twice-over: an icon (key/globe) then the scope text, with
  `(Inherited)` appended when the assignment comes from a parent scope.
- Footer: `Showing 1 - 3 of 3 results.` plus paging.

### Azure IAM: Add role assignment

A full-page wizard, not a dialog. Four tabs across the top, all with a red `*`:
`Role · Members · Conditions · Review + assign`. A hidden `×` closes the whole flow.

Step 1, `Role`:

- Explanatory line: "A role definition is a collection of permissions. You can use the built-in
  roles or you can create your own custom roles."
- A `Copilot can help pick a role` affordance.
- Sub-tabs `Job function roles` and `Privileged administrator roles`, with a one-line description
  of the current sub-tab beneath them.
- Filters on one line: `Type : All`, `Category : All`.
- Grid columns: `Name`, `Description`, `Type` (`BuiltInRole`), `Category`, `Details` (`View`).
- Footer, bottom-left: `Review + assign` (primary, **disabled**), `Previous` (enabled outline,
  though it is the first step), `Next` (disabled until a role is selected).

Step 2, `Members`:

- Read-only panel `Selected role` showing the role name from step 1.
- `Assign access to` radio pair: `User, group, or service principal` (default) and `Managed identity`.
- `Members` row with a `+ Select members` link, then a grid `Name / Object ID / Type` that reads
  `No members selected` until the pane returns one.
- `Description` textarea, placeholder `Optional`, about 100px tall.

The `Select members` context pane:

- Opens from the right edge, full content height, roughly half the window wide, with its own
  header `Select members`, search field `Search by name or email address`, and a result list of
  avatar + name + email. Selected entries are removed from the result list and appear under
  `Selected members:` on the right half of the pane.
- Footer: `Select` (primary) and `Close`.
- Empty state copy: "No members selected. Search for and add one or more members you want to
  assign to the role for this resource." plus a `Learn more about RBAC` link.

Step 3, `Conditions`:

- Disabled (grey tab, not clickable) for roles that do not support conditions — `Reader` is one.
  So the wizard is four steps in name, three in practice.

Step 4, `Review + assign`:

- Read-only summary, one row per input, label column then value:
  `Role` → role name; `Scope` → the full resource ID; `Members` → a small Name/Object ID/Type grid;
  `Description` → `No description` when empty.
- Footer: `Review + assign` (primary, now enabled), `Previous`, `Next` (disabled).

Layout of the wizard, in portal units (13px base, 28px left margin, 150px label column,
24px-tall radius-2 buttons, 65px fixed footer bar). **Do not copy these** — they are the portal's
own design system. Keep the structure and substitute Foundry's tokens: 14/20 body, 12/16 labels,
32px pill buttons, radius 8 cards, `#553695` primary.

## What this changes in the design

1. **Foundry's Add user has no role picker.** Role assignment is not part of adding a person.
   openFoundry's dialog currently has Name / Email / Role. Copying Foundry means removing the role
   field from the dialog and putting role assignment on its own surface.
2. **Foundry's User table has no Added column and no Remove action.** Roles are shown, not edited,
   in the table. That contradicts openFoundry's current table.
3. **The permission line is a computed statement in Foundry too** (`Owner · Full access`, green
   dot). Ours can compute it without changing the visual.
4. **Two primary button colours exist**: brand `#553695` for enabled, grey for disabled. The
   current openFoundry grey button does not distinguish "disabled" from "secondary".

## Drift between Foundry and openFoundry today

The Users page now matches. The remaining differences are the ones this product cannot avoid, and
they are listed so they do not get "fixed" by accident.

| Element | Foundry | openFoundry |
| --- | --- | --- |
| Table columns | Name, Access type, Role, Scope | same |
| Role cell | text | text |
| Access type | text + `View only` badge for inherited rows | same |
| Scope cell | purple link + external icon, opens the portal | same, opens `/manage/access` |
| Footer | `1-3 of 3` + Prev/Next | same |
| Search | placeholder `Search`, 320 x 32 | same |
| Add user | `Add people` combobox, no role | same, plus a Name field when inviting an unknown email, and the access code on success |
| Button style | pill, brand fill when enabled | same |
| Behind `Scope` | Azure portal IAM | `/manage/access`, same structure |

The Access control page is the local stand-in for a product Foundry delegates to Azure. Its spec
is the "Azure IAM" section above; the design is `docs/designs/local-rbac.md`.
