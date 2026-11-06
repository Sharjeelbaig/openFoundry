# Foundry cleanup — 2026-11-05

Scope: resources created during the live Foundry IQ crawl in the `shazi-learn`
project, subscription `8cc6fd0f-b093-4d15-b9e9-23cb97da6968`.

## Deleted

- Knowledge base `expenses-knowledge` (Foundry control plane).
- Search index `expenses-policy-source-index`.
- Search knowledge source `expenses-policy-source`.
- Project connection `practicedeleterightaf5n88lq` (CognitiveSearch).
- Project connection `kb-expenses-knowledge-tsphu` (RemoteTool, auto-created by
  the knowledge base and removed with it).
- Knowledge base attachment from agent `heroic-agent-6f7x4hs4kk`. The active
  version is now 3 with no knowledge base. Version 2 remains in history and
  still names the deleted base; it is not active and does not cost anything.

## Verified absent

- Model deployments in `shazi-learn-resource` and
  `sharjeel-practice-resource`: 0 in both.
- Search objects on `practice-delete-right-after`:
  `indexes`, `indexers`, `datasources`, `skillsets`, `knowledgebases`,
  `knowledgesources`, `aliases`, `synonymmaps` — all empty.
- Project connections: only the two pre-existing entries remain:
  `shazilearnresourceappwyr5vh` (AppInsights) and
  `FoundryMCPServerpreview` (RemoteTool).
- Resource groups `Practice` and `rg-practice` contain only pre-existing
  resources. No storage account, search service, or model resource was created
  by the crawl.

## Left in place

- AI Search service `practice-delete-right-after` (pre-existing).
- Foundry account `shazi-learn-resource` and project `shazi-learn`
  (pre-existing).
- Agent `heroic-agent-6f7x4hs4kk` (pre-existing; active version 3 is clean).
- App Insights and its connection (pre-existing). The two failed chat attempts
  may have written a few trace records; there is no new billable resource.

## Verification commands

```bash
az cognitiveservices account deployment list \
  --name shazi-learn-resource --resource-group Practice --query "length(@)" -o tsv

az rest --method get \
  --url "https://management.azure.com/subscriptions/8cc6fd0f-b093-4d15-b9e9-23cb97da6968/resourceGroups/Practice/providers/Microsoft.CognitiveServices/accounts/shazi-learn-resource/projects/shazi-learn/connections?api-version=2025-04-01-preview" \
  --query "value[].name" -o json

TOKEN=$(az account get-access-token --resource https://search.azure.com --query accessToken -o tsv)
for ep in indexes indexers datasources skillsets knowledgebases knowledgesources aliases synonymmaps; do
  curl -s "https://practice-delete-right-after.search.windows.net/$ep?api-version=2026-08-01-preview" \
    -H "Authorization: Bearer $TOKEN"
done
```

## Addendum — parity probe cleanup, 2026-11-06

The second live probe (`parity-probe`) was removed after its REST and MCP
responses were captured under
`docs/designs/foundry-knowledge-reference/live-parity-2026-11-06/`.

Deleted:

- Knowledge base `parity-probe` (`DELETE /knowledgebases/parity-probe` -> 204).
- Knowledge source `ks-file-592` (`DELETE /knowledgesources/ks-file-592` -> 204;
  its generated index was removed with it).
- Agent `parity-agent` (`DELETE /agents/parity-agent` -> `agent.deleted`).
- Project connection `kb-parity-probe-tsphu` (RemoteTool).

Verified after deletion:

- `knowledgebases`, `knowledgesources` and `indexes` on
  `practice-delete-right-after` all return `[]`.
- The project agent list contains only the pre-existing
  `heroic-agent-6f7x4hs4kk`.
- Project connections are the pre-existing three:
  `shazilearnresourceappwyr5vh`, `FoundryMCPServerpreview`, and
  `practicedeleterightaf5n88lq`.

Correction to the 2026-11-05 list: `practicedeleterightaf5n88lq` is present
again; it is the CognitiveSearch project connection used by the parity probe and
was left in place because the pre-existing search service remains.
