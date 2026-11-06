# Local SharePoint/OneDrive and Fabric export connectors

The `sharepoint-export` and `fabric-export` source kinds index folders that a
person has already exported from Microsoft 365 or Fabric. They are real
connectors over local files, not a simulated tenant connection.

They exist because Work IQ, tenant-wide SharePoint and OneLake require a
Microsoft 365/Fabric tenant and admin consent. Exporting the content you are
allowed to use gives a useful local path without pretending to be those
services. See `docs/designs/ai103-roadmap.md`.

## SharePoint / OneDrive export

- Source kind: `sharepoint-export`.
- Config: `path` (required), `include`, `exclude`, `maxFileBytes`.
- Behaviour: the same folder walker and text/PDF/image extraction as a local
  folder, with `metadata.sharePointExport: true`.
- Typical export: SharePoint **Sync** or **Download a copy**, OneDrive
  **Download**, or an administrator-provided export folder.

Example API call:

```bash
curl -X POST http://127.0.0.1:3000/api/knowledge \
  -H "Content-Type: application/json" \
  -H "Cookie: of_session=..." \
  -d '{
    "action": "addSource",
    "id": "kb_...",
    "sourceKind": "sharepoint-export",
    "sourceName": "SharePoint export",
    "sourceConfig": { "path": "/Users/you/SharePoint/Exports" }
  }'
```

Then sync it with `{"action":"sync","id":"kb_...","sourceId":"src_..."}`.

## Fabric export

- Source kind: `fabric-export`.
- Config: `path` (required), `delimiter` (default `,`), `titleColumn`,
  `maxRows` (default 5,000; capped at 50,000).
- Accepted files: `.csv`, `.json`, `.jsonl`.
- CSV: the header row becomes field names; each data row becomes one document.
- JSONL: each non-empty line becomes one document.
- JSON: an array becomes one document per element; a single object becomes one
  document.
- `titleColumn` selects a column for the document title. Without it the title
  is `<file> row <n>`.
- Every document is `key: value` lines and carries
  `metadata.fabricExport: true`, plus the file and row number.

Example source config:

```json
{
  "path": "/Users/you/Fabric/Exports",
  "delimiter": ",",
  "titleColumn": "invoice",
  "maxRows": 5000
}
```

Export from a Fabric lakehouse or warehouse as CSV/JSON. This connector does not
query OneLake, Fabric SQL or a data agent.

## Live evidence

`live-ingest.json` and `tenant-exports.png` come from a real knowledge base with
both sources:

- SharePoint source: 2 documents (`leave-policy.md`,
  `security-guidelines.txt`).
- Fabric source: 6 documents (four `revenue.csv` rows and two `tickets.jsonl`
  records).
- 8 documents / 8 chunks embedded with
  `hf.co/nomic-ai/nomic-embed-text-v1.5-GGUF:Q8_0`.
- Retrieval activity names both source kinds and returns references of type
  `sharepoint-export` and `fabric-export`.

The Fabric rows were indexed as normal documents, for example:

```text
region: EMEA
quarter: Q1
revenue: 1250000
currency: EUR
```

## Tests

`tests/knowledge-export.test.ts` (3 tests) covers:

- the SharePoint export walker and its metadata,
- CSV and JSONL row extraction, titles and metadata,
- `titleColumn`, `maxRows` and validation errors,
- catalog availability for both connectors.

## Honest limits

- No Microsoft Graph, SharePoint REST, OneDrive API or OneLake connection is
  made. The folder must already exist on this machine.
- There is no delta sync, change token, permission mapping or ACL enforcement.
  Access is whatever the local filesystem allows. Export only content you are
  allowed to index.
- SharePoint metadata, versions, comments and list items are not preserved by a
  file export; only the exported file content is indexed.
- Fabric semantic models, measures, lineage and governance are not preserved.
  CSV/JSON rows are indexed as text, with no tabular query engine.
- Re-syncing walks the folder again; it does not use Fabric/SharePoint change
  feeds.
- Tenant-wide Work IQ remains a Microsoft 365 capability with no local
  equivalent.
