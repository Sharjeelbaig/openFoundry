# Notices

## Copyright and attribution

openFoundry is Copyright 2026 Sharjeel Baig.

If you redistribute openFoundry, or a substantial part of it, keep the copyright
notice, the `LICENSE` file and the `NOTICE` file, and state what you changed. That
is what the Apache-2.0 license requires. The name and logo are not covered by the
license; see `TRADEMARKS.md`.

Contact: <eng.sharjeel.baig@gmail.com>

The credit line used on the project site and in the README is:

> openFoundry by Sharjeel Baig, https://github.com/Sharjeelbaig/openFoundry

## Application

openFoundry is an independent open-source project. It is not affiliated with, endorsed
by, or sponsored by any model provider or platform vendor.

The interface and artwork are original to openFoundry. The project name, logo, terms and
privacy pages are its own.

## Model and provider marks

Publisher marks in the workspace are fetched at runtime from the
[Simple Icons CDN](https://simpleicons.org) when a permissively licensed mark exists. They
are used only to identify model provenance. All trademarks remain the property of their
owners. Publishers without an available mark receive a neutral first-letter tile; no
third-party marks are bundled in this repository.

## Reference interface

The Discover → Tools layout and interaction model were studied in a signed-in
reference application so openFoundry could offer a familiar local workflow. The
implementation is original: no vendor HTML, CSS, JavaScript, images, fonts or
product icons are copied into this repository. Product names, the openFoundry
identity, colours, copy and detail-page sections are openFoundry's own. openFoundry
is not a hosted replacement for the reference service and provisions nothing in a
cloud subscription.

## Tool catalog

The tools catalog is a local index of publicly available tool metadata. It records
tool, company and product names, categories, release dates, authentication types and
documentation links for identification. Those names, marks and links remain the
property of their publishers. openFoundry does not redistribute vendor icons, vendor
skill files, connector operation descriptions, hosted connector gateway URLs, OAuth
client IDs or client secrets. Catalog summaries and local skill instructions are
original local adaptations. Company grouping is inferred and may not match the
publisher's own taxonomy. No affiliation or endorsement is implied. Check the
publisher's terms before connecting a tool.

The catalog is factual metadata, not a mirror of the reference database. A provenance
and risk review is in `docs/legal-review.md`.

## Routines and workflows

Routines and workflows are openFoundry's own local implementation. Their data
model, scheduler, graph interpreter, expression parser, node components,
templates and copy are original. No vendor workflow YAML, icons, screenshots,
CSS or JavaScript are bundled. The reference product's workflow lifecycle does
not control openFoundry's features.

Microsoft Entra dispatch identity and Microsoft Teams event triggers are not
emulated. The product explains those cloud requirements and offers local agent
identity, a local webhook trigger and a real GitHub issue poller instead.
See `docs/routines-workflows.md`.

## Software dependencies

- Tauri — MIT / Apache-2.0
- Next.js — MIT
- React — MIT
- Node.js — MIT and third-party licenses included with the runtime
- Fluent UI React Icons — MIT
- React Flow (@xyflow/react) — MIT
- cron-parser — MIT
- yaml — ISC
- Simple Icons — CC0 1.0 for the icon data
- Other dependencies are listed in `package-lock.json` and `src-tauri/Cargo.lock`.
