# Knowledge engine — what is built

Date: 2026-11-06
Status: working end to end for local sources
Supersedes the "dummy" implementation described in
`knowledge-verification-2026-11-05.md`.

## In one paragraph

Knowledge is now a real retrieval engine. Content is stored in SQLite, split into
chunks that carry a heading breadcrumb, page and character range, embedded, and
retrieved with BM25 plus vector search fused by Reciprocal Rank Fusion. Every
source owns its documents, so deleting a source deletes its data and its
citations. A source can only show `Ready` after a completed sync.

## Storage

`data/knowledge/knowledge.db` (SQLite, WAL) holds the control plane and the data
plane. `knowledge.json` was imported once and renamed to
`knowledge.json.pre-sqlite`; it is no longer read.

Tables: `bases`, `sources`, `documents`, `chunks`, `chunks_fts` (FTS5),
`vectors`, `jobs`, `job_events`, `retrieval_runs`, `retrieval_run_refs`.

`documents.source_id` is a foreign key with `ON DELETE CASCADE`. Deleting a
source removes its documents, chunks, vectors and FTS rows in one transaction.

## Ingestion

`chunkDocument` (`src/lib/knowledge/chunk.ts`):

- Splits on blank lines and form feeds (PDF page breaks).
- Tracks Markdown headings into a breadcrumb (`Expenses > Approvals`).
- Flushes on a heading change or a page change, so a chunk never spans pages.
- Target 1800 characters with 220-character overlap on oversized blocks.
- Stores `section`, `page`, `char_start`, `char_end`, `token_count`, `chunk_hash`.

`upsertItem` (`src/lib/knowledge/service.ts`):

- Content hash is the identity. Unchanged content skips chunking and embedding.
- Re-syncing a changed document replaces only that document's chunks.
- Documents not seen in a run are deleted (deletion propagation).
- Embeddings are pinned to the model recorded on the base. A different model is
  refused with an explicit error instead of silently comparing truncated vectors.
- If no embedding runtime is available the sync fails loudly; it does not write a
  "ready" index with no vectors.

## Extraction and OCR

`src/lib/knowledge/extract.ts` is the single extractor used by uploads, folders,
S3, Azure Blob and Google Drive:

- PDFs use `pdftotext` first. If the text layer is missing or shorter than 40
  characters, the PDF is rendered with `pdftoppm` at 200 dpi and each page is
  OCR'd with tesseract. Page breaks are preserved as form feeds so chunk page
  numbers stay correct.
- Images (png, jpg, webp, tif, bmp) are OCR'd directly.
- Every document records `metadata.extraction` as `text`, `pdf-text` or `ocr`.

Verified end to end: a scanned PDF with an empty text layer (`pdftotext` returns
nothing) was uploaded through `/api/knowledge`, OCR produced
`OKAPI-OCR-4417 / The vault code is 4417`, and retrieval returned that chunk with
page 1.

## Retrieval

`retrieve()` (`src/lib/knowledge/retrieve.ts`):

1. **Plan.** `minimal` uses the query as-is. `low` and `medium` ask the
   configured chat model for subqueries; if it is missing or fails, a
   deterministic keyword planner runs and the activity log says
   `heuristicQueryPlanning`.
2. **L1.** FTS5 `bm25()` and cosine over stored vectors, run per subquery, top 50
   each.
3. **Fusion.** Reciprocal Rank Fusion with `k = 60`, summed across subqueries.
4. **L2.** The chat model scores the top 50 passages 0-4 and reorders them.
   Results below 2.5 are dropped. If every result is below the threshold the
   best three are returned and the activity log says so. With no chat model the
   response reports `reranker: none` and does not claim parity.
5. **L3.** At `medium` effort a coverage judgement asks whether the first pass
   answers the question. If it does not, a second pass embeds and retrieves the
   refined queries, re-fuses with the first pass, re-runs L2, and records the
   judgement as a second `modelQueryPlanning` activity. Without a chat model the
   pass is skipped and the final `agenticReasoning` note says so; nothing is
   simulated.

Activity shape follows the live Foundry capture in
`docs/designs/foundry-knowledge-reference/`. Source-kind entries exist per
source and subquery, ids are sequential, and the reranker has no activity record:
its output tokens are folded into `agenticReasoning.reasoningTokens`.

`POST /api/knowledge/:id/retrieve` accepts Foundry's shape: `messages` or
`intents`, `knowledgeSourceParams`, `outputMode`, `retrievalReasoningEffort`,
`includeActivity`, `maxOutputDocuments` and `maxRuntimeInSeconds` (default 180).
It returns `response`, `activity`, `references`, plus `citations` and `meta` for
the local UI. A run that hits the time budget returns a partial result with
`meta.partial: true`, and the REST route answers `206`, matching Foundry.

`answerSynthesis` requires a chat model. Without one the request fails with an
explicit message instead of returning extractive data labelled as an answer.

## Connectors

| Kind | State | Notes |
| --- | --- | --- |
| File (upload) | working | txt, md, csv, json, html, pdf, and images via OCR |
| Folder | working | include/exclude globs, size limit, skip lists |
| Web | working | SSRF guard blocks loopback, private ranges and metadata |
| Git | working | tracked text files from a local checkout |
| SQLite | working | one document per row, chosen text columns |
| CSV | working | quoted fields, CRLF, one document per row |
| S3-compatible | working | AWS, MinIO, R2, B2, Wasabi; SigV4 verified against AWS's published vector |
| Azure Blob Storage | working | SAS token through a connection; paginated container listing |
| WebDAV | working | Nextcloud, ownCloud, Box; depth-1 PROPFIND then GET |
| Google Drive | working | BYO OAuth client, PKCE, refresh tokens; Docs/Sheets/Slides exported to text |
| GCS, SFTP | not built | shown disabled with the reason |
| Azure AI Search | working | remote source: connection holds the service URL and key, the source holds the index and field mapping |
| MCP | working | remote: picks a saved MCP server and one of its advertised tools, calls it at retrieval time, and reports `mcpServer` activity |
| SharePoint / OneDrive export | working | indexes a local export folder; see `docs/designs/local-export-connectors-2026-11-06/` |
| Fabric export | working | indexes exported CSV/JSON/JSONL rows; see `docs/designs/local-export-connectors-2026-11-06/` |
| Work IQ, Fabric IQ, SharePoint remote/indexed, OneLake | live tenant versions not built | shown disabled with the tenant prerequisite; use an export folder where possible |

Nothing unbuilt is selectable. The picker renders the reason on the row.

## Connections

A source no longer carries a credential. It points at a **connection**, which
holds the endpoint, non-secret settings and an encrypted secret:

- `src/lib/connections/catalog.ts` — client-safe provider metadata.
- `src/lib/connections/vault.ts` — AES-256-GCM, key derived from `data/machine.key`.
  The limit is stated in the file: this protects backups, logs and accidental
  exposure, not a compromised host.
- `src/lib/connections/store.ts` — CRUD over `data/connections.json`. Secrets are
  stored as ciphertext and never returned. The API exposes only `secretSet` and
  a masked hint. The old seeded row pointing at `localhost.search.local` is
  dropped on read.
- `src/lib/connections/providers.ts` — a real test per provider: ListBuckets for
  S3, a container list for Azure Blob, `GET /indexes` for Azure AI Search, and
  `PROPFIND` for WebDAV. A 401 is stored as a failure; no code path can mark a
  connection healthy without a response.
- `src/lib/connections/resolve.ts` — merges the endpoint and decrypted secret
  into the source config at sync time.

Google Drive is the first OAuth provider. The operator supplies a client ID
and secret; `src/lib/connections/google.ts` builds the consent URL with PKCE
(S256), signs a short-lived state with the machine key, and exchanges the code at
`/api/connections/google/callback`. The callback is public but validates the
signature, so it does not depend on the session surviving the consent screen.
Refresh tokens are sealed with the same vault and refreshed transparently before
a sync.

`POST /api/connections/:id/test` records the result, so the row shows Verified or
Failed with the provider's own message. Deleting a connection makes any source
that used it fail with an explicit message instead of a generic error.

UI: `/build/knowledge/connections` lists, creates, tests and deletes connections.
The source dialog shows a connection picker for S3, Azure Blob and WebDAV.

## MCP endpoint

Each base exposes `POST /api/knowledge/:id/mcp` (streamable HTTP, JSON
responses). `POST /api/knowledge/:id/mcp/token` issues a bearer token, stored as
SHA-256 and shown once. The endpoint implements `initialize`, `tools/list` and
`tools/call`, with one tool, `knowledge_base_retrieve`, taking `query_variants`
(1-3 strings, 150 characters each).

The tool contract and result blocks mirror the live Foundry MCP endpoint:
`execution.taskSupport` is `optional`; `_meta` lists
`KnowledgeSourceMetadata` as `[{name,type}]`; the first content block is the
retrieve response text (extractive JSON or answer text), followed by one
`{"kind":"reference",...}` block per citation with `uri`, `mimeType` and
`sourceData`; the result `_meta` reports `agenticReasoningTokens`.

Verified end to end against the running app: no token -> 401; `initialize` ->
protocol `2025-06-18`; `tools/list` -> one tool with the captured schema;
`tools/call` -> passage block plus reference blocks for a real indexed document.

## UI

- Source picker is driven by `src/lib/knowledge/catalog.ts`.
- "Use existing sources" calls `/api/knowledge/reusable-sources`, which returns
  sanitized source records from every base. Choosing one hands its id to the new
  base, where `cloneSourceIntoBase()` copies the definition, connection and
  indexed documents. Secrets are removed by `sanitizeSourceConfig()` before the
  list is returned or the copy is written.
- Selecting an available source opens a generated dialog for its fields, creates
  the source, and runs the first sync immediately.
- Each indexed source has a sync button.
- Source status is `Not configured | Indexing | Ready | Ready with errors | Error
  | Cancelled | Remote | Unavailable`. `Connected` no longer exists.
- The Indexes tab counts documents and chunks per source.
- Creating a base from the create page hands the chosen source type to the
  detail page, which opens the real dialog.

## Evidence

`tests/knowledge.test.ts` covers the S3 SigV4 signature (AWS published vector),
chunk breadcrumbs, page breaks, hard splits, RRF ordering and CSV parsing.
`tests/knowledge-l3.test.ts` covers the medium-effort coverage pass, the second
`modelQueryPlanning` record, per-source activity ids, the extractive response
shape and the runtime budget. `tests/remote.test.ts` covers the `searchIndex`
activity and reference shape plus a real MCP `tools/call` through a saved
server. The full suite is 241 passing tests with 1 skipped (42 files). The skipped test is the gated MLX fine-tune, which passes when `OPENFOUNDRY_RUN_FINETUNE=1` is set. `tests/aec.test.ts` covers delay estimation, echo cancellation, double-talk preservation, nonlinear room suppression and WAV resampling. `tests/aec-physical.test.ts` runs the canceller against a real speaker-to-microphone capture. `tests/response-store-shared.test.ts` covers the cross-machine HTTP store, shared policy, owner scoping and token rejection. `tests/response-store-tenants.test.ts` covers per-tenant tokens, quotas, policies and audit isolation. `tests/response-tenant-admin.test.ts` covers persistent tenant creation, token rotation, disable/enable, quotas and the admin audit stream. `tests/guardrails.test.ts` covers the real PII/credential and injection guardrail engine. `tests/tool-approvals.test.ts` and `tests/tool-approval-broker.test.ts` cover the human approval policy and broker, `tests/semantic-guardrail.test.ts` covers the semantic verdict contract, and `tests/knowledge-export.test.ts` covers the SharePoint/OneDrive and Fabric export connectors. `tests/foundation-finetune.test.ts` covers the MLX fine-tune, candidate-grid construction, best-candidate tie-breaking, the 7B 4-bit QLoRA defaults and the hardware preflight. `sdk/python/tests/test_live.py` adds fourteen live Agent Framework SDK and Voice Live integration tests across streaming, tool calls, orchestration, barge-in, noise-gated VAD and reference-signal AEC.

`tests/knowledge-reuse.test.ts` proves an uploaded file source is listed with
sanitized config, cloned into a fresh base with its documents, chunks and
vectors, and retrieved there with no reconfiguration. It also proves `apiKey`
and `password` keys never reach the reusable-source list or the clone.

Runtime checks against the dev server:

- pasted text -> one chunk with `section: "Expenses"`, `page: 1`, char range
- folder with two files -> two documents, one chunk each, correct sections
- a `127.0.0.1` web source -> `Error`, reason "Refusing to fetch a private
  address", zero documents
- answer synthesis without a chat model -> explicit 400
- deleting a source -> its citations disappear, other sources remain
- "Use existing sources" -> `Files` from `test-knowledge` selected, base created,
  detail page reported "1 existing source attached", and retrieval returned the
  copied PDF chunks

## Known gaps

- Remote knowledge sources other than Azure AI Search and MCP (Work IQ,
  Fabric, SharePoint) are not built. Their live tenant versions are disabled,
  not simulated. `sharepoint-export` and `fabric-export` index local exports
  instead; see `docs/designs/local-export-connectors-2026-11-06/`.
- The L2 reranker uses a chat model, not a trained cross-encoder. It is honest
  about which one ran, but relevance will differ from Azure's semantic ranker.
- Azure Blob uses a SAS token; account-key (SharedKey) signing is not
  implemented.
- Azure AI Search is a remote-only source; the connection provider and retrieval
  path use it live. Microsoft-tenant sources (OneLake, live SharePoint, Work IQ,
  Fabric) remain disabled until a tenant is available; exported files can be
  indexed locally.
- Google Drive has not been run against a live Google account in this
  environment. The consent URL, state signing, PKCE derivation, token refresh
  and folder query are unit-tested; the first real proof is the operator
  connecting their own client.
- No production build was run while the dev server was running; typecheck,
  lint and the test suite pass.
