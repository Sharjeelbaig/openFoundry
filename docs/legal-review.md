# Discover → Tools: legal and provenance review

Date: 2026-11-02
Scope: the openFoundry **Discover → Tools** catalog, its tool detail pages and the
local connect/create actions. This review records what was checked, what was
deliberately not copied and the risks that remain. It is an engineering provenance
record, not legal advice.

## What the screen does

- Lists **1,351** locally indexed tool entries: 1,215 connector ("Custom"), 96 remote
  MCP, 7 local MCP and 33 skills.
- Filters by Type, Provider, Category, Registry and Supported auth, with URL state,
  active-filter chips, sorting and 50-item incremental paging.
- Opens a full detail page for every entry. Skills get an instruction preview and a
  local **Create agent** action. Connectors and MCP servers get a profile page and a
  **Connect** dialog that registers an MCP endpoint or creates a local HTTP tool.

Nothing is provisioned in a cloud subscription, and no vendor-hosted connector
gateway is called.

## What was reproduced, and what was not

| Area | Reference | openFoundry |
| --- | --- | --- |
| Layout, facets, paging, card size | Studied in a signed-in browser | Rebuilt with original React/CSS; layout and interaction mirrored |
| Product copy | Vendor copy | Original copy, except short factual tool names and links |
| Tool names / publisher names | Vendor catalog | Retained for identification (nominative use) |
| Icons | Vendor logos and product icons | Neutral Fluent glyphs only; `icon` is null in all 1,351 entries |
| Skill instruction files | Vendor `SKILL.md` packs | Original local adaptations of ~450–550 characters; no vendor skill files are present |
| Connector operation tables | Vendor operation metadata | `operations` is empty for every entry (0 operations) |
| OAuth applications | Vendor client IDs | No client IDs or secrets are stored; users register their own app |
| Hosted gateway URLs | Azure connector runtime URLs | `runtimeUrls` is empty for every entry |
| Catalog database | Vendor catalog service | Local JSON index of factual metadata |

Verified mechanically:

```text
tool-catalog.json: 1,351 entries, 0 with an icon
tool-setup.json:   1,351 entries, 0 operations, 0 runtime URLs,
                   0 client_id / client_secret values
public/:           only openFoundry brand assets and abstract collection artwork
```

## Copyright

- **Names and short factual metadata** (tool name, publisher, category, release date,
  authentication types, documentation URL) are used to identify the tool. Short names
  and factual data are generally not protected by copyright, and the use is
  nominative.
- **Descriptions and skill instructions** in this repository are original local text.
  They were written for the local feature set (local models, local MCP, local HTTP
  tools), not copied from the reference catalog. Skill packs are 33 short original
  documents.
- **Interface code and styling** are original. No vendor HTML, CSS, images, fonts or
  JavaScript were copied into the repository. Fluent UI React Icons is an MIT-licensed
  dependency and is used under its own license.
- **Documentation links** point to publisher-controlled pages; the content is not
  mirrored.

Residual risk: short summaries could accidentally resemble a publisher's own wording.
Any rights-holder request to reword a summary should be actioned promptly.

## Trademark

- Tool and company names are used only to identify the tool being configured.
- No vendor logos, product icons or brand artwork are bundled. Model marks that appear
  elsewhere in the app are fetched at runtime from Simple Icons under CC0 and are not
  part of this repository.
- The UI states that openFoundry is independent, is not affiliated with or endorsed by
  any provider, and that third-party names belong to their publishers.
- "Microsoft" appears only as a factual publisher label for entries the source catalog
  attributes to Microsoft (127 entries). It is not used in the product name, logo or
  domain.

Residual risk: a publisher could still object to a name being indexed. The catalog is
an index of publicly available tools, and the disclaimers make the lack of affiliation
explicit.

## Database and contract rights

This is the highest residual risk in the feature.

- The catalog is derived from metadata visible in a signed-in reference catalog. In the
  EU/UK, a sui generis database right can protect substantial investment in obtaining,
  verifying or presenting the contents of a database, even when individual facts are
  not protected. The US does not recognise a equivalent general database right, but
  contract terms can still apply.
- Mitigations in place: only factual metadata is stored; descriptions and instructions
  are original; no operation tables, icons or hosted gateway data are reproduced; the
  catalog is a local developer index, not a competing hosted service; the source is
  attributed in `NOTICE.md`.
- The reference site's terms of use may restrict automated access or redistribution.
  The metadata was collected for interoperability and identification. If openFoundry is
  distributed commercially, obtain counsel review of those terms and consider replacing
  the seed catalog with a community-maintained or provider-published source.

## Trade dress

The layout intentionally mirrors the reference catalog (header, left facets, 3-column
88px cards, sort control, detail page with a Quick facts card). Trade dress protection
requires distinctiveness and a likelihood of confusion. Mitigations:

- openFoundry name, logo, colours, typography scale and copy are its own.
- No vendor logos or product icons appear in the catalog.
- Disclaimers are visible on the catalog and every third-party detail page.
- Detail pages use openFoundry-specific sections ("How openFoundry uses it", "Legal")
  and do not reproduce vendor marketing pages.

Residual risk: the closer the layout is to the reference, the more a rights holder
could argue imitation. The functional layout is not itself the brand, and the visual
identity remains distinct.

## OAuth and credentials

- No vendor OAuth client IDs, secrets, refresh tokens or tenant IDs are stored.
- OAuth endpoint templates use public provider endpoints and placeholders such as
  `CUSTOMER_TENANT_ID`; users supply their own app registration and credentials.
- Tokens entered in the connect dialog are written to the local workspace store on this
  machine and are never sent to openFoundry or the reference service.
- The UI tells users to register the shown redirect URI in their own provider app.

## Third-party terms

The connect flow can call a provider's MCP endpoint or API with the user's credentials.
The user is responsible for complying with that provider's terms. The catalog and
detail pages say so and link to the publisher's documentation rather than restating
its terms.

## Open items before a public commercial release

1. Have counsel review the reference site's terms of use and the database-right
   position for the seed catalog.
2. Consider a takedown/attribution process for publishers who object to being indexed
   (the repository issue tracker is the current channel).
3. Re-check the 20 `aka.ms` and 5 `learn.microsoft.com` documentation links before each
   release; they are link metadata, not mirrored content.
4. Keep the automated catalog audit (`npm run audit:catalog`) in CI so icons,
   operations, credentials or vendor skill files cannot be reintroduced unnoticed.
