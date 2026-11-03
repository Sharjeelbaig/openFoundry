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

| Element | Foundry | openFoundry |
| --- | --- | --- |
| Table columns | Name, Access type, Role, Scope | Name, Access type, Role, Scope, Added, Remove |
| Role cell | text | dropdown |
| Access type | text + `View only` badge | single badge |
| Scope cell | purple link + external icon | monospace text + copy button |
| Footer | `1-3 of 3` + Prev/Next | `N project users` + a sentence |
| Search | placeholder `Search`, 320 x 32 | `Search users`, up to 360 |
| Add user | `Add people` combobox, no role | Name, Email, Role |
| Button style | pill, brand fill when enabled | mixed |
