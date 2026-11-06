# Knowledge and connections — parity audit

Date: 2026-11-06
Method: compared the live Foundry captures in
`docs/designs/foundry-knowledge-reference/`, the crawl notes in
`knowledge-parity.md` §5, the Microsoft Learn agentic-retrieval pages, and the
code in `src/lib/knowledge`, `src/lib/connections`, `src/app/api/knowledge`.

This sheet exists because "looks similar" is not evidence. Each row says what
Foundry does, what openFoundry does, and whether the difference is deliberate.

## Control plane

| Foundry behaviour | openFoundry | Status |
| --- | --- | --- |
| Base has name, description, chat model, reasoning effort, output mode, retrieval instructions | All present in the create/detail form | Match |
| Answer instructions exist in the API but not the create form | Stored in the API, not shown | Match |
| Base is bound to a connection (Azure AI Search resource) | Bound to the local SQLite store; shown as "Local knowledge store" | Local equivalent |
| Up to 10 knowledge sources | Enforced in `addSource` | Match |
| Encryption with a customer-managed key | Not available; the inert checkbox was removed and the limitation is stated in the form | Not available (honest) |
| Delete base removes it from attached agents | Implemented in `deleteBase` | Match |

## Data plane

| Foundry behaviour | openFoundry | Status |
| --- | --- | --- |
| Indexed sources: File, Blob, SQL, OneLake, SharePoint Indexed | File, Folder, Web, Git, SQLite, CSV, S3, Azure Blob, WebDAV, Google Drive, SharePoint/OneDrive export, Fabric export | Superset locally; live OneLake/SharePoint need a tenant |
| Remote sources queried at retrieval time | **Azure AI Search and MCP are real remote sources**; Work IQ/Fabric/live SharePoint are not built | Partial; export connectors cover local copies |
| Web source is Bing grounding | Web is an on-machine crawler | Local equivalent |
| File limits: 100/200 files, 50–100 MB, 180 s | 200 files per upload, 50 MB each; retrieval enforces `maxRuntimeInSeconds` (default 180) and returns a partial result at the budget | Match |
| Incremental indexing and deletion detection | Content hash identity; unseen documents deleted per source | Match |
| Auto-created indexer pipeline (data source, skillset, indexer) | One ingestion pipeline in `sync.ts` | Local equivalent |
| "Use existing sources" attaches configured sources | Lists real source records, strips secret keys, and clones config + indexed documents into the new base | Match in behaviour; snapshot copy |

## Retrieval

| Foundry behaviour | openFoundry | Status |
| --- | --- | --- |
| L1: BM25 + vector in parallel | FTS5 `bm25()` + cosine, top 50 each | Match |
| RRF fusion, k = 60 | `rrf()` with k = 60 | Match |
| L2: semantic ranker, top 50, score 0–4, threshold 2.5 | Chat-model listwise reranker, same scale and threshold; reports `none` when unavailable | Equivalent, not a cross-encoder |
| L3: iterative pass at medium effort | Implemented: a coverage judgement at medium effort runs a second retrieval, fusion and rerank pass when the model says the first pass is insufficient | Match in shape |
| Minimal/Low/Medium planning | Minimal skips planning; low/medium ask the chat model, or record `heuristicQueryPlanning` when no model is configured | Match |
| Extractive and answer-synthesis outputs | Both; synthesis refuses without a chat model and returns `[ref_id:n]` markers | Match |
| Activity log with tokens and timings | `activity[]` mirrors the captured Foundry shapes: source-kind entries per source and subquery, `modelQueryPlanning`, `modelAnswerSynthesis`, `agenticReasoning`, sequential ids, `queryTime`, `model`, `logicalReasoningEffort` | Match; reranker tokens are folded into `agenticReasoning`, as Foundry does |
| Citations with page, section and character range | Indexed chunks carry all three; remote hits carry URI | Match |
| Per-base MCP endpoint, one tool, `query_variants` | `/api/knowledge/:id/mcp`; tool schema, `execution`, `_meta`, result blocks and reference blocks match the live capture | Match, verified against the live server |
| Agent calls the base through its MCP connection | Agent chat calls the base's MCP endpoint with a short-lived signed token | Match |

## Connections

The word "connection" means different things on each side:

| Foundry | openFoundry |
| --- | --- |
| A project connection to the Azure AI Search resource that hosts knowledge bases | The local store is implicit; the list shows "Local knowledge store" |
| A source dialog asks for the storage account and key inline | A source picks a saved connection (account + key), then names its container |

The two-level split is the same: **connection = where and how to authenticate**,
**source = what inside it**. For Azure AI Search the connection is the service and
the source is the index, which is exactly Foundry's split. For Blob the connection
is the storage account and the source is the container.

What differs is placement in the UI: Foundry types credentials into the source
dialog; openFoundry reuses a connection so one key rotation fixes every source.
`docs/designs/knowledge-engine.md` documents the API and the encrypted vault.

Fixed in this pass:

- The knowledge list no longer displays an arbitrary S3/Drive connection in its
  "Connection" strip. It shows the local knowledge store.
- Creating a base with several selected sources now queues every source dialog
  instead of silently keeping only the first.
- Azure AI Search is a working remote source: the connection holds the service
  URL and key, the source holds the index and field mapping, and retrieval calls
  the index live. A connection failure appears in the activity log without
  discarding local results.
- A remote source only reports `Remote` after its configuration validates.
- MCP is a working remote source: the dialog lists saved MCP servers and their
  advertised tools, retrieval performs a real `tools/call`, and activity uses
  the `mcpServer` type with `mcpServerArguments`.
- "Use existing sources" in the create flow lists real source records from
  every base. Selecting one clones its sanitized config, connection reference
  and indexed documents; the detail page then shows it without reopening the
  source dialog.

## Still divergent, and why

1. **Indexes tab shows one row per indexed source.** Foundry's file base produced
   no row in the live project; ours reflects the real local index.
2. **Reusing a source is a snapshot, not a live link.** The create flow lists
   real configured sources; reusing one copies its definition, connection
   reference and indexed content into the new base. A later sync of the original
   does not rewrite the copy.
3. **Work IQ, Fabric IQ and live SharePoint knowledge sources are not built.**
   Azure AI Search and MCP are the working examples of the pattern; the
   tenant-gated ones stay disabled until a tenant is available.
   `sharepoint-export` and `fabric-export` provide a real local alternative for
   files the operator is allowed to export.

## Response-shape parity (live capture)

The reference capture is in `foundry-knowledge-reference/`: a live knowledge base
(`parity-probe`) was queried through both the REST retrieve action and its MCP
endpoint with a real Entra token. Those responses are the ground truth for these
shapes, all reproduced by `retrieve()` and the MCP route:

- Activity ids are sequential from 0; each source entry carries `queryTime`,
  `count`, `elapsedMs`, `knowledgeSourceName` and a source-specific arguments
  object (`fileArguments.search`, `searchIndexArguments.search/filter/
  sourceDataFields/searchFields/semanticConfigurationName`).
- At medium effort the second planning call is another `modelQueryPlanning`
  entry, not a custom `iterativeSearch` type. There is no reranker activity;
  reranker output tokens are summed into `agenticReasoning.reasoningTokens`.
- `agenticReasoning` carries `retrievalReasoningEffort` and
  `logicalReasoningEffort`, and a run that filtered every candidate sets each
  source entry's `count` to 0 with the "did not meet the reranker score
  threshold" warning.
- Extractive `response[0].content[0].text` is a JSON array of
  `{ref_id:number, content}`; answer mode returns text with `[ref_id:n]` markers.
- References carry `type`, string `id`, `activitySource`, `rerankerScore`,
  `docName` (file) or `docKey` (search index), `citationUrl`, and
  `sourceData: null`. Indexed citations resolve through
  `/api/knowledge/:id/documents/:docId`.
- The MCP tool's input schema is `query_variants` only (1–3, max 150 chars),
  with `execution.taskSupport: "optional"` and
  `_meta.KnowledgeSourceMetadata: [{name,type}]`. Its result is a passage block
  followed by one JSON reference block per citation, and
  `_meta.agenticReasoningTokens`.

Fixed in this pass: source auth now offers inline connection fields (with an
optional saved connection), and the agent path goes through the base's MCP
endpoint rather than an in-process call.
