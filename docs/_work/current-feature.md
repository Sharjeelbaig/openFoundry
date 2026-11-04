# Current feature: tool catalog audit and legal cleanup

Status: complete
Updated: 2026-11-02

## Data integrity audit

- 1,351 entries, 1,351 unique ids, 1,351 unique slugs.
- 1,351 setup records; no missing or orphaned setup.
- 33 Skills, 96 Remote MCP, 7 Local MCP, 1,215 Custom.
- All Remote MCP entries have an http(s) endpoint.
- All documentation links are valid http(s) URLs.
- All auth methods have a label/type; all fields have a name/label/type.
- Fixed the duplicate LSEG slug and the Agent SDK auth method with no fields.
- Added `npm run audit:catalog` (`scripts/audit-tool-catalog.mjs`) to keep these
  invariants enforced.

## Legal cleanup

- Removed vendor icon URLs from the catalog; cards use neutral type icons.
- Removed hosted OAuth client IDs, redirect URLs and identity-provider metadata.
- Removed hosted connector gateway URLs.
- Removed copied connector operation tables and paths.
- Replaced copied connector descriptions and tags with original local summaries.
- Replaced all 33 vendor skill Markdown files with original local adaptations.
- Removed the old Partner/Microsoft provider bucket; company grouping is inferred.
- Added in-app disclaimers on the catalog and skill pages.
- Added a tool catalog section to NOTICE.md covering third-party names, links,
  icons, skill files, operation metadata and inferred company grouping.

## Boundaries

- The audit proves every entry has a local action and valid setup data; it does
  not prove a third-party API will accept the user's credentials.
- 1,178 Custom entries do not publish a base URL; the setup form asks the user
  for the provider API URL.
- 372 OAuth methods do not publish authorization/token URLs; the UI falls back
  to a manual access token.
- The vendor documentation link remains for the full official reference.
