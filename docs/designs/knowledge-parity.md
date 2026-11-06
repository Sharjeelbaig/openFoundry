# Knowledge (Foundry IQ) parity — working brief

Status: brainstorm, live crawl complete, functionality verified, not approved
Date: 2026-11-05
Reference captures: `docs/designs/foundry-knowledge-reference/`
Audit evidence: `docs/openFoundry-Dummy-Features-Audit.pdf`
Functionality evidence: `docs/designs/knowledge-verification-2026-11-05.md`

This is a decision document, not an implementation plan. It records what the
current feature does, what Foundry IQ actually does, the architecture options,
and the one scope question that has to be answered before anything is frozen.

---

## 1. The problem

The Knowledge page looks like Foundry IQ but does not behave like it.

The audit found that every non-upload source is cosmetic: the UI says
"Connected" and the source appears in the list, but no connector runs, no
content is fetched, and retrieval never sees it. Only uploaded text is indexed.
The seeded Azure AI Search connection is not a real connection to anything.

The requirement is parity with Foundry IQ in UI and behaviour, with a real
ingestion pipeline, minus Microsoft-only services that cannot be reproduced
locally.

---

## 2. What the current implementation does

Confirmed by reading the code, not by inference.

| Area | Current behaviour | File |
| --- | --- | --- |
| Persistence | Whole knowledge feature is one JSON file, rewritten on every change. Documents, chunks and embeddings live inline in `knowledge.json` (84 KB today). | `src/lib/store.ts`, `data/knowledge.json` |
| Ingestion | Synchronous. Upload text is read, chunked and embedded inside the request that creates the source. There is no queue, no retry, no progress, no cancellation. | `src/app/api/knowledge/route.ts` |
| Sources | `upload`, `work-iq`, `fabric-iq`, `azure-blob`, `web`, `azure-ai-search` exist as labels. Only `upload` has a code path. The rest are recorded as `Connected`. | `src/lib/types.ts`, `KnowledgeDetail.tsx` |
| Chunking | Fixed 900 characters with 140-character overlap, paragraph-first. No page, heading or section metadata. | `src/lib/rag.ts` `chunkText` |
| Embeddings | Ollama or Foundry Local if available; otherwise the whole base silently becomes "lexical BM25". All chunks are embedded in one call. | `src/lib/rag.ts` `indexKnowledgeBase`, `src/lib/providers.ts` |
| Retrieval | Stopword-based local query planner, not an LLM. Lexical score or cosine over uploaded chunks only. `Minimal`/`Low`/`Medium` change how many keyword variants are generated, not the retrieval behaviour Foundry describes. | `src/lib/rag.ts` `planQueries`, `retrieveCitations` |
| Citations | `{documentId, documentName, chunk, score}`. No page, section, character range, URL, or source identity. | `src/lib/types.ts` `Citation` |
| Indexes | Derived on read from knowledge bases. No independent index record, schema, version, or status. | `src/app/api/knowledge/route.ts` |
| UI | List, create form, detail page, upload/dropzone, retrieval test. Close to Foundry in places, but custom hero copy, fabricated source options, and no real source configuration dialogs. | `src/app/build/knowledge/**` |

The existing UI already has some Foundry vocabulary: `Knowledge (Foundry IQ)`,
tabs, connection row, reasoning effort, output mode, retrieval instructions,
Ask AI area. That vocabulary is not backed by the corresponding behaviour.

---

## 3. What Foundry IQ does

Foundry IQ is a layer over Azure AI Search. It has a control plane (knowledge
base definition) and a data plane (indexes and retrieval). The important
distinction for us: a knowledge base is not an index. It references sources;
some sources are indexed into an index, some are queried remotely at retrieval
time.

### 3.1 Control plane

- A knowledge base has a name, description, connection (Azure AI Search), chat
  model deployment, retrieval reasoning effort, output mode, retrieval
  instructions, answer instructions, and up to 10 knowledge sources.
- The embedding model is chosen per indexed source, not on the base. The live
  create page shows the chat model on the base and the embedding model inside
  the File source dialog.
- Sources are either **indexed** (Foundry creates the data source, skillset,
  index and indexer) or **remote** (queried live at retrieval time).
- Reasoning effort:
  - **Minimal** — no LLM query planning; up to 10 sources; direct search.
  - **Low** — one planning pass; up to 3 sources and 3 subqueries; answer
    synthesis budget around 5k tokens.
  - **Medium** — iterative planning and relevance assessment; up to 5 sources
    and 5 subqueries; synthesis budget around 10k tokens.
- Output modes: **extractive data** (chunks) or **answer synthesis** (a written
  answer grounded in the chunks).
- Retrieval instructions steer query planning; answer instructions steer
  synthesis.
- The activity log records planning, searches, refinements, and synthesis with
  timings and token usage.
- Citations/references point back to the source document and location.
- Each knowledge base exposes an MCP endpoint with a
  `knowledge_base_retrieve` tool.

### 3.2 Data plane

- Indexed sources are materialised into an Azure AI Search index with a
  generated schema, chunking, optional enrichment, and vector fields.
- Remote sources are not ingested. They are called at query time through their
  native connector (for example an existing Azure AI Search index, Work IQ, or
  Fabric IQ).
- File upload is the simplest indexed source: 100 files in the 2026-05-01
  preview and 200 in the 2026-08-01 preview, 50–100 MB per file, 180-second
  processing limit. Supported types include PDF, DOC/DOCX, PPT/PPTX,
  XLS/XLSX, JSON, scripts, and plain text. "Standard" extraction uses Content
  Understanding; "minimal" extraction does not.
- Indexers support incremental runs, deletion detection, and field mappings.
- Ranking is three levels, not one score. **L1** runs BM25 for the text query
  and HNSW (or exhaustive KNN) for the vector query in parallel. **Fused L1**
  merges both ranked lists with Reciprocal Rank Fusion,
  `score = sum(1 / (rank + k))` with `k = 60`. **L2** sends the top 50 to the
  semantic ranker, a cross-encoder over summarised document text that returns
  `@search.rerankerScore` from 0 to 4. Semantic ranking is optional for plain
  hybrid search and **required** by agentic retrieval.
- **L3** is iterative search: the engine and the LLM agree that a second pass
  is needed and re-query. It only applies at `medium` reasoning effort.
  `minimal` skips query planning; `low` (the default) and `medium` plan
  subqueries.
- Verified against Microsoft Learn on 2026-11-05:
  `azure/search/hybrid-search-ranking`, `azure/search/semantic-search-overview`,
  `azure/search/search-relevance-overview`, `azure/search/agentic-retrieval-overview`.

### 3.3 Agent surface

- An agent can attach knowledge bases, or call the knowledge base as a tool.
- The MCP endpoint lets external agents call the same retrieval surface.
- Answers in the agent playground show numbered citations that link to the
  source.

### 3.4 What is Microsoft-only

These cannot be reproduced faithfully without Azure or Microsoft 365:

- Work IQ (organisational context from Microsoft 365).
- Fabric IQ / OneLake Catalog.
- Azure AI Search semantic ranker, skillsets, and Content Understanding.
- Azure Blob Storage and Azure AI Search as live backends, unless the user
  supplies credentials.
- Microsoft-hosted embedding and chat deployments, unless the user supplies a
  provider.

Faking these is worse than not shipping them. The honest local equivalent is a
source type that is visible, explains why it is unavailable, and does not
pretend to be connected.

---

## 4. Parity matrix

| Foundry capability | Local target | Decision |
| --- | --- | --- |
| Knowledge base CRUD | Full | Replicate |
| Up to 10 sources per base | Full | Replicate |
| File upload source (Foundry "File", Preview) | Full | Replicate with local extraction |
| Folder source | Local equivalent | Add; label "Folder", not "Azure Blob" |
| Web source | Full | Add crawler with URL scope and SSRF guard |
| SQLite / CSV source | Local equivalent of Azure SQL | Add; useful for structured local data |
| MCP remote source (Foundry "MCP Server", Preview) | Full | Add; query at retrieval time with configured tools |
| Azure Blob source | BYO only | Optional, requires credentials; otherwise unavailable |
| Azure AI Search source | BYO only | Optional remote query or mirror; otherwise unavailable |
| Azure SQL source (Preview) | Local equivalent | SQLite/CSV connector, same shape |
| Microsoft SharePoint Remote (Preview) | Not reproducible | Show disabled with explanation |
| Microsoft SharePoint Indexed (Preview) | Not reproducible | Show disabled with explanation |
| Work IQ | Not reproducible | Show disabled with explanation |
| Fabric IQ / OneLake | Not reproducible | Show disabled with explanation |
| Reasoning effort Minimal/Low/Medium | Full, with local models | Replicate semantics; heuristic fallback when no chat model |
| Extractive vs answer synthesis | Full | Replicate |
| Retrieval / answer instructions | Full | Replicate |
| Activity log | Full | Persist per retrieval run |
| Citations with locations | Full | Document, page/section, character range, URL/path |
| Indexes tab | Full | Table plus empty state; show only materialised indexes |
| MCP endpoint | Full | Per-base streamable HTTP endpoint, `knowledge_base_retrieve` |
| Agent attachment | Full | Attach through a per-base `RemoteTool` MCP connection |
| Connections page | Local equivalent | Show the local store and per-base MCP connections |
| Azure AI Search connection row | Local equivalent | Show the local knowledge store as the connection |
| Foundry portal chrome | Not in scope | Keep openFoundry shell and navigation |

The UI can be near-identical inside the Knowledge pages. The surrounding app
shell, left navigation, account menu and branding remain openFoundry. Pixel
parity of Microsoft-owned illustrations and product names is not a goal.

---

## 5. UI inventory

### 5.1 Reference captures (documentation screenshots)

- Page title `Knowledge (Foundry IQ)`, tabs `Knowledge bases` and `Indexes`.
- A dismissible `Ask AI` strip with suggestion chips:
  `What is a knowledge base?`, `What knowledge types are supported?`,
  `How do I add knowledge to an agent?`.
- Connection row: `Connection` label, a chip with the search resource name and
  a chevron, and a `Manage` link.
- Centered empty state: dotted brain illustration, heading
  `Ground your agent in enterprise knowledge`, two lines of body copy, purple
  `Create a knowledge base` button, then `Manage connections` and `Docs`.
- Source modal with a `File` card, `Preview` badge, and copy
  `Upload files directly — no storage account or connection string needed.
  Service-managed processing.`
- Agent chat citation: a numbered source pill under the answer with a small
  source icon and the document title.

### 5.2 Live crawl, 2026-11-05

Environment: signed-in Foundry, project `shazi-learn`, AI Search resource
`practice-delete-right-after` (Australia East), dark theme. Raw captures are in
`docs/designs/foundry-knowledge-reference/live-*.png`.

**List, not connected**

- Header and tabs as above.
- Centered hero video, heading, copy, `Foundry IQ resource *` combobox,
  `Auth Type *` (API Key / Project Managed Identity), `Connect`, `Create new
  resource`.
- The `Ask AI` strip was not shown in this state.

**List, connected and empty**

- Connection strip: `Connection` + chip + `Manage`.
- Dotted brain, `Ground your agent in enterprise knowledge`, copy,
  `Create a knowledge base`, `Manage connections`, `Docs`.

**List, with a knowledge base**

- Search input, connection chip, `Manage`, primary `Create a knowledge base`
  on the right.
- Table columns: `Name`, `Description`, `Knowledge sources`, `Status`.
- Status is a green `Active` badge.
- Pagination `1-1 of 1`.

**Create a new knowledge base**

- Header: back arrow, title, `Save knowledge base`, `Cancel`.
- `Basic configuration`.
- `Name *`, auto-generated `knowledgebase967` in the live capture.
- `Description` textarea, placeholder `Optional summary describing the
  knowledge base's purpose and content`.
- `Chat completions model` with info icon, `Select model`, then a `Model:` line
  and a `Global Standard deployment` pill.
- `Retrieval reasoning effort *`, `Minimal`.
- `Output mode *`, `Extractive data`.
- `Retrieval instructions` with info icon and example `Prioritize
  'HR_Policies' for benefits questions, otherwise query 'CompanyWeb'`.
- `Knowledge sources (Foundry IQ) *` card with three source icons, heading
  `Add knowledge sources`, copy, `Add sources` split button, `Upload files`.
- `Encryption settings` collapsible: `Use an encryption key you control.`
- Selecting a model creates a `Global Standard deployment` and shows
  `Deploying model` until it finishes.
- Saving shows `Knowledge base created`; the form remains mounted and reports a
  duplicate name until the list is opened. The list then shows the new base.

**Source picker**

`Add sources` opens a menu headed `Knowledge sources`:

- `Work IQ` (Preview)
- `Fabric IQ (OneLake Catalog)` (Preview)
- `Azure Blob Storage`
- `Web`
- `Azure AI Search Index`
- `Use existing sources`
- `Browse more`

`Browse more` opens `Choose a knowledge type` with a two-column card grid:

- Azure AI Search Index
- Azure Blob Storage
- Web
- Microsoft SharePoint (Remote) (Preview)
- Microsoft SharePoint (Indexed) (Preview)
- Fabric IQ (OneLake Catalog) (Preview)
- Azure SQL (Preview)
- Work IQ (Preview)
- File (Preview)
- MCP Server (Preview)
- `Connect`, `Cancel`

**Source dialogs**

All use the title `Create a knowledge source`, a source card at the top, and
`Create` / `Cancel` at the bottom, unless noted.

- **File**: `Files` dropzone (`Add files or drag and drop`), supported types,
  up to 50 MB per file, file table with name/size/remove, `These files will be
  uploaded after the knowledge source is created.`, `Name *`, `Description`,
  `Embedding model` (`text-embedding-3-small`, `Global Standard deployment`),
  `Advanced settings` with encryption key vault URI/name/version.
- **Web**: `General` / `Advanced`; name, description; warning that Web
  Knowledge Source is subject to Bing terms, costs, and data leaving the Azure
  compliance boundary. `Advanced`: allowed URLs, blocked URLs, encryption.
- **Azure Blob Storage**: name, description, storage account, container name,
  authentication type (API Key), content extraction mode (`Minimal`), warning
  that Standard extraction uses Azure AI Content Understanding and is not
  supported in `northcentralus`, embedding model, chat completions model.
- **Azure AI Search Index**: name, description, `Select search index` (index
  must contain a semantic configuration).
- **Work IQ**: name, description, Microsoft Entra application, federated
  credential ID, setup warning (billing, Global Administrator enablement,
  `WorkIQAgent.Ask` permission, admin consent, federated credential).
- **Fabric IQ**: name, description, managed identity required, `Enable system
  identity`, warning about non-Foundry data boundary, loading OneLake catalog.
- **Azure SQL**: name, description, connection string, table or view, high
  watermark column.
- **MCP Server**: name, description, server URL, authentication (`None`),
  tools (`At least one tool is required. Only configured tools will be invoked
  at query time.`), `Add tool`.
- **SharePoint Remote**: name, description, advanced settings, note that it
  uses real-time access, respects permissions, and indexes nothing.
- **SharePoint Indexed**: name, description, connection string (enter details
  or paste), container name, content extraction mode, embedding model,
  user-assigned managed identity.

**Knowledge base detail**

- Header: back arrow, name, `Save`, `Use in an agent` split button, overflow
  menu with `Delete knowledge base`.
- Same fields as the create page, plus a source table with `Name`, `Type`,
  `Status`, a `1 file` pill under the source name, and an overflow menu.
- Source overflow: `Remove from knowledge base`, `Delete permanently`.
- `Use in an agent` lists recent agents and `View all agents`.
- Selecting an agent attaches the base to that agent and navigates to its
  builder.
- Delete dialog: `Are you sure you want to delete "<name>"? This action cannot
  be undone.` with red `Delete` and `Cancel`.
- `Encryption settings` at the bottom.

**Indexes tab**

- Search input.
- Empty state: dotted brain, `No indexes available`.
- No connection strip and no create button.
- A file knowledge base did not produce a row here in this project.

**Agent builder Knowledge section**

- `Knowledge` accordion: `Add knowledge bases for grounding. Learn more about
  best practices.`
- Attached base row: book icon, name, upload/attach icon, overflow menu.
- `Add` dropdown.
- Chat playground on the right; the agent calls the knowledge base's MCP
  endpoint. In this project the call returned `401 (Unauthorized)` because the
  generated `RemoteTool` connection had no key and the search service has
  `disableLocalAuth=true`. The error text exposes the endpoint shape:
  `https://<search>.search.windows.net:443/knowledgebases/<name>/mcp?api-version=2026-08-01-preview`.

**Connections page**

- Table columns: `Name`, `Category`, `Auth method`, `Key`, `Target`,
  `Added by`.
- Creating a knowledge base also creates a connection named
  `kb-<knowledge-base>-<suffix>` with category `RemoteTool`, auth method
  `Custom Keys`, target the knowledge base MCP URL above.
- The search resource itself is a separate `CognitiveSearch` connection with
  `API Key` auth.
- This is the mechanism the agent uses to reach the knowledge base. It is not
  a direct in-process call.

### 5.3 Still not captured

- A successful retrieval in the agent playground with citations. The live
  project's MCP connection returned 401; the reference screenshot
  `b-kb-citations.webp` shows the citation pill instead.
- Index detail (the tab was empty).
- Error, partial-success and reindex states beyond the 401.
- Exact spacing, type scale, radii and control sizes. The captures give
  structure and copy, not measurements.

### 5.4 Visual rules

- Purple primary buttons. The app's light-scheme brand is `#643fb2`; Foundry's
  button reads slightly brighter. Reuse `--brand` unless a specific token is
  needed.
- Fluent-style icons and controls, which the app already uses.
- Quiet gray page background, white content surfaces, thin dividers.
- Body copy is small and low-contrast; headings are semibold.
- Tabs use an underline, not a pill.
- The connection row is a light gray strip with a chip, not a form.
- The empty-state illustration is a dot-matrix brain. Do not copy the asset.
  A dot-matrix glyph in the same visual weight is the honest substitute.
- The list is a table, not a card grid. The current openFoundry page uses
  cards; switch to the table for parity.

### 5.5 MCP response shape

Captured directly from the live endpoint with an Entra token. Saved as
`mcp-tools-list.json` and `mcp-retrieve-response.json`.

- `initialize` returns server name `SearchWebRole.AspNetCore`, protocol
  `2025-06-18`, capabilities `logging` and `tools`.
- `tools/list` returns exactly one tool, `knowledge_base_retrieve`.
- The tool input is `query_variants`: an array of 1–3 strings, each max 150
  characters and under 12 words. `query_variants` is required.
- The tool description includes the knowledge base description, so the model
  knows what the base contains.
- Tool `_meta` includes `generateCitations: true` and
  `KnowledgeSourceMetadata` with the source names and types.
- `tools/call` returns a `content` array with two text items:
  1. a JSON array of `{ ref_id, content }` chunks;
  2. a JSON object `{ kind: "reference", ref_id, uri, mimeType, sourceData:
     { uid, snippet, metadata_storage_path } }` for each chunk.
- `_meta.agenticReasoningTokens` records the reasoning tokens spent.
- The reference `uri` points at the search index document endpoint with
  `$select=snippet,uid,metadata_storage_path` and `allowUnsafeKeys=true`.
- Index naming in the live project: `<source-name>-index`.
- Document key shape: `file-<hash>_<ordinal>`.
- Reasoning effort and output mode are properties of the knowledge base, not
  parameters of the tool call. The tool only takes queries.

This is the contract to mirror. It also explains why the agent needs a
connection: the knowledge base is an MCP server, not an in-process function.

---

## 6. Architecture options

### Option A — extend the JSON store

Keep `knowledge.json`, add a job array, store chunks and vectors as before,
run ingestion in a background function.

**Pros:** no migration, no new dependency, smallest diff.

**Cons:** every write rewrites the whole file; concurrent jobs corrupt or lose
data; no index structure, so retrieval is a full scan over a parsed JSON tree;
a 200-file source at 50 MB each cannot live in one JSON document; crash
recovery and progress tracking have to be invented; embeddings make the file
enormous. This is the current design and it is the reason the feature is dummy.
Reject.

### Option B — SQLite data plane, JSON control plane

Keep `knowledge.json` for knowledge-base definitions (name, description,
connection, models, instructions, source records). Move documents, chunks,
vectors, jobs, index records and retrieval runs into `data/knowledge.db` using
the built-in `node:sqlite`.

**Pros:**

- `node:sqlite` is in the bundled Node 24.22.2 runtime; verified locally with
  FTS5. No native addon, no rebuild per platform, no extra binary to sign.
- ACID writes, WAL, foreign keys, cascading deletes.
- FTS5 gives real BM25 lexical search without loading everything into memory.
- Vectors can be stored as BLOBs and scanned per knowledge base.
- A durable job table survives app restarts and gives real progress.
- Incremental sync is natural: content hashes, tombstones, per-source state.
- The split mirrors Foundry: control plane definition, data plane index.
- Migration from today's JSON is a one-time read of `knowledge.json`.

**Cons:**

- `node:sqlite` is still marked experimental in Node 24. The API used here
  (`DatabaseSync`, `prepare`, `exec`, `loadExtension`) is small and stable, but
  it can change.
- No `vec0` extension in the bundled runtime. Vector search is brute force
  unless we ship `sqlite-vec` per platform.
- SQLite is synchronous. Long FTS queries and vector scans block the event
  loop. At local scale this is measurable but manageable with yielding and a
  worker thread if needed.
- A storage split needs a clear rule: control plane never stores chunk text;
  data plane never stores credentials.
- Existing consumers of `getKnowledgeBases()` expect `documents` with text,
  chunks and embeddings. They need a summary DTO and, for the detail page, a
  separate documents endpoint.

### Option C — external search service

Run Qdrant, Postgres/pgvector, LanceDB or similar alongside the app.

**Pros:** real ANN, mature indexing, scales beyond local files.

**Cons:** another process to install and supervise, another data directory,
another failure mode, packaging per platform, and a cloud dependency in a
local-first desktop app. The feature does not need ANN at the file limits
Foundry itself imposes. Reject for now; revisit only if local corpora exceed
the measured brute-force budget.

### Recommendation

Option B. It is the smallest design that can honestly support the required
behaviour: durable jobs, real incremental ingestion, hybrid retrieval, and
citations. It also keeps the existing JSON store untouched for every other
feature, which limits blast radius.

---

## 7. Recommended design

### 7.1 Storage split

```
data/
  knowledge.json          # control plane: bases, source definitions, settings
  knowledge.db            # data plane: documents, chunks, vectors, jobs, runs
  knowledge/
    files/<sourceId>/...  # original uploads, content-addressed
```

Control plane (`knowledge.json`):

- `KnowledgeBase`: id, name, description, connectionId, chatModel,
  reasoningEffort, outputMode, retrievalInstructions, answerInstructions,
  sources[], status, timestamps.
- `KnowledgeSource`: id, kind, name, detail, status, config (non-secret),
  credentialRef, indexName, embeddingModel, embeddingProvider, lastSyncAt,
  documentCount, error. The embedding model lives here, matching Foundry.
- `Index` (data plane record): id, sourceId, baseId, name, schema, vector
  dimension, document count, chunk count, status, builtAt.

Data plane (`knowledge.db`):

- `documents` — one row per source item. `source_id`, `external_id`,
  `content_hash`, `title`, `mime`, `size`, `path`, `url`, `metadata_json`,
  `status`, `error`, `added_at`, `updated_at`, `deleted_at`.
- `chunks` — `document_id`, `ordinal`, `text`, `token_count`, `page`,
  `section`, `char_start`, `char_end`, `chunk_hash`.
- `chunks_fts` — FTS5 external-content table over `chunks.text`.
- `chunk_vectors` — `chunk_id`, `model`, `dim`, `vec` (Float32 BLOB),
  `norm`, optional `scale` for int8.
- `jobs` — `id`, `base_id`, `source_id`, `kind`, `status`, `stage`,
  `progress`, `message`, `attempts`, `max_attempts`, `payload_json`,
  `created_at`, `started_at`, `finished_at`, `cancel_requested`.
- `job_events` — append-only progress/error log.
- `indexes` — materialised index record per base: name, version, schema_json,
  documents, chunks, status, updated_at.
- `retrieval_runs` — query, effort, output mode, timings, token usage,
  activity_json, citations_json.
- `sync_state` — per source checkpoint (etag, last-modified, cursor, tree
  hash).

Secrets: source credentials never go into `knowledge.json` or SQLite in
plaintext. Reuse the existing connection/credential store and keep only a
reference in the source config.

### 7.2 Schema notes

- `PRAGMA journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- `documents.source_id` references a source id in the JSON control plane, not
  a SQLite foreign key. Delete propagation is explicit in the service layer
  because the parent lives in JSON.
- `chunks.document_id` cascades on document delete.
- `chunks_fts` uses `content='chunks'` and triggers on insert/update/delete.
- `chunk_vectors.chunk_id` cascades on chunk delete.
- Indexes on `documents(source_id, deleted_at)`, `chunks(document_id, ordinal)`,
  `jobs(status, created_at)`.
- Schema version in `PRAGMA user_version`; migrations are ordered SQL files.

### 7.3 Ingestion pipeline

Every source type produces the same intermediate shape:

```
SourceItem {
  externalId, title, mime, bytes, uri,
  content: string | Buffer,
  metadata: { page?, section?, url?, row?, ... }
}
```

Stages:

1. **Discover** — enumerate items. Upload: the uploaded files. Folder: walk the
   tree with ignore rules. URL: fetch the page, optionally follow same-origin
   links to a depth limit. SQLite/CSV: enumerate rows or tables. MCP: no
   ingestion; remote query only.
2. **Fetch** — copy or download bytes. Enforce size, count and time limits.
3. **Extract** — bytes to structured text blocks. Record extraction warnings.
4. **Chunk** — blocks to chunks with page/section/character metadata.
5. **Enrich** (optional) — title, summary, keywords via the chat model. Skip
   when no model or when the source is set to fast extraction.
6. **Embed** — batch chunks through the configured embedding provider. Store
   vectors. If no provider, leave vectors empty and mark the index
   `lexical-only`; do not pretend it is fully indexed.
7. **Index** — write chunks and vectors, update FTS, update counts, mark the
   source ready.
8. **Publish** — update the index record and the control-plane status.

Idempotency:

- `documents.content_hash` is the identity. Unchanged content skips extraction,
  chunking and embedding.
- `chunks.chunk_hash` lets unchanged chunks keep their vectors when a document
  changes elsewhere.
- Source re-sync marks unseen documents `deleted_at`, then hard-deletes after
  the run. Retrieval filters `deleted_at IS NULL`.

Failure handling:

- Each item can fail without failing the source. The source ends
  `ReadyWithErrors` (or `Failed` if nothing succeeded) and lists the failed
  items.
- Retries use exponential backoff, capped. A failed item is retryable from the
  UI.
- Cancellation sets `cancel_requested`; the worker checks between items and
  between embedding batches.

Concurrency:

- One worker per process, one job at a time by default. Embedding batches can
  run concurrently within a job, bounded.
- A `globalThis` singleton prevents duplicate workers during Next.js hot
  reload.
- On boot, jobs left in `running` are reset to `queued` with the attempt count
  preserved.

### 7.4 Connectors

**File upload**

- Store original bytes under `data/knowledge/files/<sourceId>/`.
- Enforce Foundry-like limits: 200 files per source, 100 MB per file,
  180 seconds per file. Make them configurable, but show the defaults.
- Accept PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, JSON, JSONL, CSV/TSV, MD, TXT,
  HTML, and common source-code extensions.

**Folder**

- Local path, recursive, with ignore rules for `.git`, `node_modules`,
  `.next`, build output, hidden files, and configurable globs.
- Allowed extensions and max file size.
- Manual "Sync now" plus a scheduled interval. A file watcher is optional and
  should be opt-in; it adds a dependency and platform-specific behaviour.
- Incremental using relative path, size, mtime and content hash.

**Web**

- Single URL, or same-origin crawl to depth 1–2 with a page cap.
- Respect `robots.txt`; rate limit per host; identify the crawler.
- Extract main content, title, canonical URL, published date if present.
- SSRF guard: block loopback, link-local, private ranges and cloud metadata
  addresses by default. Allow an explicit override for local docs sites.
- Store `etag`/`last-modified` and skip unchanged pages.

**SQLite / CSV**

- Read-only connection to a local SQLite file, or upload a CSV.
- Choose a table/view or a SQL query; map columns; one document per row, or
  one document per table with a schema description.
- Warn about PII and about large tables. Cap rows per sync.
- Never write to the source database.

**MCP remote source**

- Reuse the existing MCP client registry (`src/lib/mcp.ts`) and credentials.
- At retrieval time, call the configured tool with the query; convert the
  result to chunks with a synthetic document identity.
- No ingestion, no embedding. Mark it `Remote` in the UI.
- This is the local equivalent of Foundry's remote knowledge source.

**Azure Blob / Azure AI Search (optional BYO)**

- Only enabled when the user supplies an endpoint and credential.
- Azure Blob: list and download a container; same pipeline as upload.
- Azure AI Search: either query the existing index remotely, or mirror
  documents into the local index. Remote query is cheaper and closer to
  Foundry's remote source behaviour.
- If credentials are absent, show the source type as unavailable with a clear
  reason. Do not create a fake connected source.

**Work IQ / Fabric IQ**

- Visible in the source picker with a "Not available in this build" state and
  a one-line reason. No fake connection.

### 7.5 Extraction and chunking

Extraction dependencies, chosen to stay pure JavaScript where possible:

| Type | Approach |
| --- | --- |
| PDF | `unpdf` or the `pdfjs-dist` legacy build. Page-level text. Detect scanned pages with no text and mark `needs_ocr`. |
| DOCX | `mammoth` to HTML, then block parsing. Headings and lists preserved. |
| PPTX | Unzip and parse slide XML text runs. One section per slide. |
| XLSX | `exceljs` read-only. Sheet to Markdown table, row cap. |
| CSV/TSV | Streaming parser. Header row as schema. |
| HTML | `cheerio` plus a readability heuristic. Strip nav, footer, script, style. |
| MD/TXT/code | Direct read. Preserve heading hierarchy and code fences. |
| JSON/JSONL | Pretty-print or one record per line. |

OCR is out of scope for the first milestone. A scanned PDF fails with an
actionable message rather than producing an empty index.

Chunking:

- Parse into blocks: heading, paragraph, list, table, code.
- Target 600–900 tokens, 100–150 token overlap. Approximate tokens with a
  stable character ratio unless a tokenizer is added; store the approximation
  and make the target configurable.
- Never split a table or code block if it fits the budget.
- Prepend a heading breadcrumb to each chunk so a retrieved chunk is
  self-contained.
- Store `page`, `section`, `char_start`, `char_end`, `token_count`.
- Deduplicate chunks by hash within a document.

### 7.6 Embeddings

- Provider order: configured embedding deployment, Ollama, Foundry Local,
  OpenAI-compatible endpoint. The existing `embedTexts` already covers Ollama
  and Foundry Local; extend it with a generic OpenAI-compatible provider.
- Batch size 32–64. Retry 429 and 5xx with jittered backoff. Timeout per
  batch.
- Record model id and dimension on the index. Refuse to mix dimensions.
- Normalise vectors at write time; cosine becomes a dot product.
- Store Float32 BLOBs. Add int8 quantisation when a base exceeds a measured
  threshold; keep the scale per vector for rescoring.
- If no embedding provider is available, the source still indexes lexically
  and the UI says `Lexical only`. Retrieval works, but hybrid ranking is not
  claimed.

### 7.7 Retrieval

Query planning by effort:

- **Minimal** — no LLM. Use the raw query for FTS and vector search. Cap at 10
  sources.
- **Low** — one chat call to rewrite and split into at most 3 subqueries. Cap
  at 3 sources. Fuse results. Optional answer synthesis with a 5k-token
  budget.
- **Medium** — plan, retrieve, assess coverage, refine once. Cap at 5
  subqueries and 5 sources. Synthesis budget 10k tokens.
- If no chat model is configured, fall back to the existing heuristic planner
  and label the activity step `heuristic`. Do not silently pretend an LLM
  planned the query.

Scoring:

- FTS5 BM25 over chunk text.
- Cosine over vectors for the same filtered chunk set.
- Reciprocal Rank Fusion, `k = 60`.
- Optional MMR for diversity when the caller asks for it.
- Deduplicate overlapping chunks from the same document.
- Default topK 10, max 50.

This is L1 plus fusion only. It has **no L2**. Foundry's agentic retrieval ranks
with the semantic ranker after RRF, and that step is not optional there. A local
build that stops at RRF is honest only if the UI and the activity log say `no
semantic reranker`; it must not claim upstream parity. The three options are a
local cross-encoder reranker, a chat model that scores and reorders the top 50,
or an explicit degraded label. Pick one before M2.

Outputs:

- Extractive: ordered chunks with citations, scores, and the activity log.
- Answer synthesis: a grounded answer with inline `[n]` markers, a citation
  list, and the same activity log. If the model cannot support an answer from
  the retrieved chunks, return an explicit insufficient-evidence answer
  instead of inventing one.
- Every run is persisted in `retrieval_runs` for the activity UI and audit.

Citations:

```
{
  id, documentId, sourceId, title, uri,
  page?, section?, charStart?, charEnd?,
  excerpt, score
}
```

The UI can open the source preview at the cited location.

### 7.8 Jobs and progress

- `POST /api/knowledge/sources/:id/sync` enqueues a job and returns
  `202 { jobId }`.
- `GET /api/knowledge/jobs?baseId=...` returns jobs and recent events.
- `POST /api/knowledge/jobs/:id/cancel` sets the cancel flag.
- The detail page polls every 2–3 seconds while a job is active. Server-sent
  events are a later optimisation; polling matches the existing client.
- Progress is per stage and per item: `12/40 files extracted`, `embedding
  320/900 chunks`.

### 7.9 Migration

On first open of the new code:

1. Read `knowledge.json`.
2. Create `knowledge.db` and the schema.
3. For each base and document, insert the document, its chunks and vectors.
4. Rewrite `knowledge.json` with the new control-plane shape: documents become
   counts, source records gain `config` and sync state.
5. Keep a one-time backup `knowledge.json.pre-sqlite`.
6. If migration fails, leave the JSON untouched and surface an error; do not
   half-write.

Existing data is small enough that a synchronous one-time migration is fine.

### 7.10 API surface

```
GET    /api/knowledge                      list bases + indexes
POST   /api/knowledge                      create / update / delete / reindex
GET    /api/knowledge/:id                  base detail + source summaries
GET    /api/knowledge/:id/documents        paginated document summaries
GET    /api/knowledge/:id/documents/:docId document metadata + chunk preview
POST   /api/knowledge/:id/sources          add a source
PATCH  /api/knowledge/:id/sources/:sid     update source config
DELETE /api/knowledge/:id/sources/:sid     remove source + data
POST   /api/knowledge/:id/sources/:sid/sync enqueue sync
GET    /api/knowledge/jobs                 job list + events
POST   /api/knowledge/jobs/:id/cancel      cancel
POST   /api/knowledge/:id/retrieve         retrieval (extractive or synthesis)
GET    /api/knowledge/:id/runs             retrieval history
GET    /api/knowledge/:id/mcp              MCP endpoint (streamable HTTP)
```

Keep the existing `/api/knowledge/search` path as an alias for one release so
the current UI and any saved agent configs do not break.

### 7.11 Agent and MCP surface

Foundry's live behaviour is not a direct function call. Creating a knowledge
base creates a `RemoteTool` connection whose target is the base's MCP endpoint,
and the agent calls that connection. Mirror that shape.

- `src/app/api/chat/route.ts` already accepts `knowledgeBaseIds`. Replace the
  `retrieveCitations` call with the new retrieval service and pass citations
  through to the trace.
- The agent builder already lists knowledge bases. Add source status and a
  link to the base.
- Add a per-base MCP endpoint implementing:
  - `initialize`
  - `tools/list` → one tool, `knowledge_base_retrieve`
  - `tools/call` → `{ query_variants: string[] }` with 1–3 queries, max 150
    characters each. Accept `query` as a one-item alias for compatibility.
  - The response is the content/reference shape captured in section 5.5.
- Reasoning effort, output mode, instructions and topK stay on the base, not
  in the tool call, matching Foundry.
- Create an internal `RemoteTool` connection per base, named
  `kb-<base>-<suffix>`, targeting the local MCP URL. The agent attaches the
  base by referencing this connection. This matches Foundry and keeps the
  agent path identical to any other MCP server.
- Auth: generate a per-base token, store it hashed, and return it once to the
  connection. The endpoint binds to loopback by default. Do not ship an open
  MCP endpoint.
- The response shape mirrors the retrieval API: content, citations, activity.
- The 401 seen in the live portal is the failure mode to avoid: the connection
  existed but had no usable credential, and the search service had local auth
  disabled. Test the end-to-end call, not just the connection record.

---

## 8. UI plan

### 8.1 List page

- Match the live structure: title, tabs, connection strip, search, primary
  `Create a knowledge base` on the right.
- Not connected: show the resource picker, auth type and `Connect`. Local
  build: the "resource" is the local knowledge store, already provisioned.
- Connected and empty: dotted brain, Foundry's heading and copy, `Create a
  knowledge base`, `Manage connections`, `Docs`. Add one short line that
  indexing happens on this computer.
- With data: a table, not cards. Columns `Name`, `Description`, `Knowledge
  sources`, `Status`. Status is a badge. Pagination at the bottom.
- The `Ask AI` strip should only appear where Foundry shows it. If there is no
  local help model, the chips open docs or prefill the create flow; they do not
  pretend to answer.
- The connection row is a real local connection: name, status, `Manage` link.

### 8.2 Create knowledge base

- Header: back arrow, title, `Save knowledge base`, `Cancel`.
- `Basic configuration`:
  - `Name *`
  - `Description`
  - `Chat completions model` with deployment label
  - `Retrieval reasoning effort *` (`Minimal`, `Low`, `Medium`)
  - `Output mode *` (`Extractive data`, `Answer synthesis`)
  - `Retrieval instructions` with the Foundry example
- `Knowledge sources (Foundry IQ) *` card with `Add sources` and `Upload
  files`.
- `Encryption settings` collapsible. Local build: a disabled/placeholder state
  unless a real local key store is added. Do not fake a Key Vault.
- The live page did not show a separate answer-instructions field. Do not add
  one to the create form for parity; keep answer instructions in the API and
  settings if needed.
- Validation: required name, duplicate name, model compatibility, source
  required, limits.

### 8.3 Source dialogs

One dialog per source kind, sharing the live structure: source card, `General`
/ `Advanced` tabs where Foundry has them, `Name *`, `Description`, type-specific
fields, `Create` / `Cancel`.

- File: dropzone, supported types, 50 MB per file, file table, embedding model,
  advanced encryption.
- Folder: path picker, include/exclude globs, max file size, sync interval.
- Web: allowed URLs, blocked URLs, crawl depth, page cap. Show a warning that
  web content leaves the local machine.
- SQLite/CSV: connection string or file picker, table/view, high-watermark
  column (matching Azure SQL's shape).
- MCP: server URL, authentication, tools list, `Add tool`. At least one tool is
  required. Only configured tools are invoked at query time.
- Azure Blob / Azure AI Search: endpoint, credential, container/index, test
  connection. Only enabled with BYO credentials.
- Work IQ / Fabric IQ / SharePoint Remote / SharePoint Indexed: visible in the
  picker, disabled with a one-line reason. Do not fake a connection.

### 8.4 Detail page

- Header: back arrow, name, `Save`, `Use in an agent` split button, overflow
  menu with `Delete knowledge base`.
- Same form as the create page.
- Source table: `Name`, `Type`, `Status`, with a `1 file` style pill under the
  source name and an overflow menu. Source actions: `Remove from knowledge
  base`, `Delete permanently`.
- `Use in an agent` lists recent agents and `View all agents`. Selecting one
  attaches the base and opens the agent builder.
- Delete dialog with the exact warning copy.
- `Encryption settings` at the bottom.
- No separate retrieval playground. Foundry tests retrieval through the agent
  chat and the MCP/API surface. Add a local "Test retrieval" action only if it
  is clearly an extension, not a parity claim.

### 8.5 Indexes tab

- Search input.
- Empty state: dotted brain, `No indexes available`.
- With data: a table of real index records with name, type, sources, documents,
  chunks, status, updated.
- A file knowledge base did not create a visible index row in the live project.
  Do not invent rows; if the local build materialises an index, show it.

### 8.6 Agent builder

- `Knowledge` accordion with `Add knowledge bases for grounding. Learn more
  about best practices.`
- Attached base row: book icon, name, attach/upload icon, overflow.
- `Add` dropdown.
- The agent calls the base through its MCP connection. The chat answer shows
  numbered citations that link to the source. If retrieval fails, show the
  real error, not a generic failure.

### 8.7 States

- Empty, loading, indexing with progress, partial success, failed with error,
  cancelled, lexical-only, stale index.
- Every status must be backed by a real job or index record. No decorative
  "Connected" badges.

---

## 9. Milestones

**M0 — Foundation and file parity**

- SQLite data plane, migration, job queue, worker.
- File upload source end to end: store, extract, chunk, embed, index, retrieve,
  cite.
- List/create/detail UI for files, with real progress and errors.
- KB detail with source table and source actions.
- Retrieval API with citations and a basic activity log.
- Success test: create a base from the UI, upload a 20-file mixed corpus, watch
  progress, retrieve with a citation that points to the right file and page,
  then delete the source and confirm its citations disappear.

**M1 — Local connectors**

- Folder and Web sources, incremental sync, deletion propagation.
- Document list and preview.
- Job cancel/retry.
- Source dialogs for folder and web.
- Success test: change one file and one web page, sync, verify only those
  documents are reindexed and stale citations disappear.

**M2 — Retrieval parity and agent surface**

- Minimal/Low/Medium planning with a local chat model, heuristic fallback.
- Extractive and answer-synthesis outputs, instructions, activity persistence.
- Per-base MCP endpoint (`knowledge_base_retrieve`) with a generated token.
- Internal `RemoteTool` connection per base, matching Foundry's shape.
- Agent builder Knowledge section, attach flow and citation rendering.
- Success test: attach a base to an agent, ask a question, and get a grounded
  answer with working citations. A failed auth must surface the real error, as
  Foundry's 401 did.

**M3 — Structured and remote sources**

- SQLite/CSV source.
- MCP remote source.
- MCP endpoint for external agents.
- Indexes tab with real records.
- Optional BYO Azure Blob / Azure AI Search.

**M4 — Hardening and parity pass**

- Limits, timeouts, retries, backoff, cancellation.
- SSRF, path traversal, credential handling, redaction.
- Performance: measure brute-force vector search; add int8 or ANN only if the
  budget is missed.
- Live Foundry crawl and UI corrections.
- Tests: migration, chunking, retrieval ranking, deletion, job recovery.

---

## 10. Risks and unknowns

1. **Remaining UI gaps.** The live crawl covered the list, create form, detail
   form, source dialogs, indexes empty state and agent Knowledge section. Still
   missing: a successful cited answer, index detail, light-theme measurements,
   and error/partial-success states beyond the 401. Do not claim pixel parity
   for those.
2. **`node:sqlite` stability.** It is experimental in Node 24. The used surface
   is small, but a Node upgrade can change it. Pin the bundled Node version and
   add a smoke test that opens a database, creates an FTS5 table and runs a
   query.
3. **Agent-to-KB authentication.** Foundry creates a `RemoteTool` connection
   with `Custom Keys`, and the live project's connection had no usable key, so
   the agent returned 401. The local build must generate, store and rotate a
   per-base token, and the agent must fail with the real error when it is
   missing. Do not ship a connection record that looks configured but cannot
   authenticate.
4. **Two paths for retrieval.** Foundry routes agent retrieval through the
   base's MCP endpoint, not a direct call. Mirroring that adds a network hop
   and a token, but it keeps the agent surface identical and makes external MCP
   clients work. The alternative, calling the retrieval service in-process, is
   simpler but diverges. Decide before building the agent path.
5. **Model deployment side effects.** Selecting a model in Foundry created a
   `Global Standard` deployment. The local build should not silently deploy
   anything; it should use an existing deployment or refuse with a clear
   message. The UI can show the deployment label without creating one.
6. **Dark and light themes.** The live capture is dark; the reference captures
   are light. Both need to be checked. The app supports both, so parity work
   must include both.
7. **Vector scale.** Brute force is fine for tens of thousands of chunks, not
   millions. Foundry's own file limits cap the common case. Measure before
   adding ANN; do not ship a native extension for a problem we do not have.
8. **Extraction quality.** PDF tables, scanned pages and complex Office layouts
   will be worse than Content Understanding. Be explicit in the UI about what
   was extracted and what was skipped. Do not claim OCR.
9. **Embedding availability.** If Ollama/Foundry Local is not running, the
   feature must still work lexically and say so. Silent degradation is the
   current bug.
10. **Credential handling.** BYO Azure sources introduce secrets. Reuse the
    existing connection store; never write secrets into `knowledge.json` or the
    SQLite file.
11. **SSRF and filesystem scope.** URL and folder sources are powerful. Default
    to deny private network ranges and paths outside the chosen root; require an
    explicit override.
12. **Two-store consistency.** JSON metadata and SQLite data can diverge on a
    crash. Use a single service layer for writes, explicit delete propagation,
    and a startup reconciliation check.
13. **Scope creep.** Foundry IQ is a cloud product with many Azure-specific
    behaviours. The matrix in section 4 is the contract; anything outside it is
    a new decision, not an implementation detail.
14. **"Pixel-perfect" is not measurable from screenshots alone.** We have the
    structure and copy for the main screens, but spacing, control sizes and
    state transitions still need measurement. The remaining unknown is a
    successful cited answer and the index detail view.
15. **No L2 reranker in the local design.** The local scoring stops at RRF, so
    ranking quality will sit below Foundry on paraphrased or multi-hop queries.
    This is a quality gap, not a UI gap, and it cannot be closed by crawling the
    portal. Decide between a local reranker and an honest degraded label.

---

## 11. Open questions

1. **Milestone scope.** What is the smallest first milestone that counts as
   done: local equivalents only (file, folder, web, SQLite/CSV, MCP, agent
   attach) with cloud-only sources honestly disabled, or also BYO Azure Blob /
   Azure AI Search connectors in the first cut?
2. **Remaining capture.** Do we need a successful cited answer and an index
   detail screen badly enough to fix the live project's auth (managed identity
   or a working remote-tool key), or is the existing citation reference enough?
3. **Embedding provider.** Which provider should be the default for a fresh
   install: Ollama, Foundry Local, or an OpenAI-compatible endpoint? The answer
   decides the onboarding and the "lexical only" fallback.
4. **Answer synthesis.** Is a local chat model always available, or should
   synthesis be hidden when none is configured? Foundry always has a model;
   local installs may not.
5. **Data limits.** Adopt Foundry's 200-file / 100 MB / 180-second limits, or
   set local limits based on measured SQLite and brute-force performance?
6. **Agent path.** Mirror Foundry's `RemoteTool` MCP connection per base, or
   call the retrieval service in-process and expose MCP only for external
   clients? The brief recommends the former for parity; the latter is simpler.

The first question is the gate. The rest can be answered during the build.
