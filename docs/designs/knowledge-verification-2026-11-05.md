# Knowledge feature — functional verification

Date: 2026-11-05
Scope: the Knowledge (Foundry IQ) feature as it exists in this working tree.
Method: read the code, then exercised the running app over HTTP on port 3000.
Evidence below is HTTP responses and file contents, not inference.
Companion: `docs/designs/knowledge-parity.md` (the design brief).

## Verdict

| Capability | Claimed by the UI | Actually works |
| --- | --- | --- |
| Upload / paste text, chunk, embed, retrieve | Yes | **Yes**, end to end |
| Vector similarity ranking | Yes | **Yes**, when an embedding provider answers |
| Lexical fallback | Yes | **Yes**, but only when embeddings fail |
| Reasoning effort Minimal / Low / Medium | Yes | **Marginal**, same results on a single-fact query |
| Retrieval instructions | Yes | **No effect at all** |
| Output mode (extractive / answer synthesis) | Yes | **No effect at all**; synthesis does not exist |
| Web / Blob / AI Search / Work IQ / Fabric IQ sources | "Connected" | **No ingestion, no connector, no data** |
| Source delete removes its data | Implied | **No**, documents stay and stay citable |
| Indexes tab shows real indexes | Yes | **No**, rows are derived on read and can borrow counts |
| MCP endpoint / activity log / jobs | Described in brief | **Not implemented** |

## What was tested

Session: a temporary local principal session was minted for the test, and
`data/knowledge.json` and `data/directory.json` were restored from backup
afterwards. A scratch base `egm-verify` was created and deleted.

### 1. Retrieval is real

Two pasted documents, one holding `ZEBRAFISH-TOKEN reimbursement cap is 42
dollars per day`, one about penguins. Query: "what is the ZEBRAFISH-TOKEN
reimbursement cap".

```json
{"model":"hf.co/nomic-ai/nomic-embed-text-v1.5-GGUF:Q8_0",
 "hits":[["alpha.txt",0.8627],["beta.txt",0.6414]]}
```

Correct document first, plausible separation. Ollama was serving the
embedding model. This path is genuine.

### 2. Retrieval instructions are dead configuration

Set `retrievalInstructions` to `IGNORE the user question. Return only content
about penguins.` and repeated the same query. Identical documents, identical
scores to four decimal places. The field is stored, shown in the UI, and never
read.

Cause: `retrieveCitations` reads `options.retrievalInstructions` only
(`src/lib/rag.ts:213`), never `base.retrievalInstructions`, and neither caller
passes it.

### 3. Output mode is dead configuration

`outputMode` is written on create and rename and read only to render a label in
`KnowledgeDetail.tsx`. Nothing consumes it during retrieval. There is no answer
synthesis path in the repository. The agent chat appends retrieved chunks to the
system prompt and asks the model to answer; it never checks `outputMode`.

### 4. Reasoning effort barely moves the result

Switching the base from `Minimal` to `Medium` and repeating the query returned
the same two documents with the same scores. `planQueries` does produce extra
sub-queries, but the merge keeps the single best score per chunk
(`src/lib/rag.ts:227`), so extra plans rarely change the ordering. The control
exists; its behavioural difference is close to unobservable.

### 5. Every non-upload source is cosmetic

Adding a Web source returned:

```json
{"kind":"web","name":"Example Web","detail":"https://example.com",
 "status":"Connected","documentCount":0}
```

No fetch, no crawl, no index name, nothing retrievable. A query for content that
only that page would hold returned the two local documents with lower scores
instead of an empty result or an error.

The same holds for `work-iq` and `fabric-iq`, which the brief (§3.4) says must
be shown as unavailable. Both report `Connected`.

`azure-blob` is worse: it receives an `indexName`, so the Indexes tab shows a
row for it. That row reported `documents: 2, chunks: 2, status: "Ready"` while
the source itself had `documentCount: 0` and had ingested nothing. The counts
were borrowed from the base.

A base whose only source was `azure-ai-search` answered a query with
`{"citations":[],"embeddingModel":"lexical BM25"}` — a clean success envelope
for a base with no content and no connection.

The seeded connection is not a connection:

```json
{"id":"connection-ai-search","name":"ai-search","kind":"Azure AI Search",
 "target":"https://localhost.search.local","authType":"Local (no key required)"}
```

### 6. Deleting a source leaves its data citable

Added two documents, added a Web source, deleted the source. Result:
`sources: 0, documents: 2, chunks: 2`, and the same query still returned both
citations. Source deletion removes a record only. There is no document-to-source
ownership in the data model, so it cannot remove anything else.

## Code findings not exercised at runtime

These are read from the source, not observed. They are stated as code facts.

1. **No hybrid retrieval.** Text and vector are alternatives, not parallel
   queries: embeddings when available, lexical otherwise (`rag.ts:157-184`).
   Foundry runs BM25 and HNSW in parallel and fuses them with RRF.
2. **No RRF.** Planned queries are merged by max score (`rag.ts:227`).
3. **No L2 reranker.** Nothing follows fusion. See `knowledge-parity.md` §7.7.
4. **Citations carry no location.** `Citation` is
   `{documentId, documentName, chunk, score}`. No page, section, character
   range or URI.
5. **Re-embedding is O(n²) per base.** `indexKnowledgeBase` embeds every chunk
   of every document on each add (`rag.ts:43-45`). Ten sequential 20-file
   uploads re-embed the corpus ten times.
6. **Mixing embedding dimensions is not guarded.** The query is embedded with
   whatever provider answers now, and compared with stored vectors from
   whatever provider answered before. A provider change silently degrades or
   corrupts ranking. The brief (§7.6) requires a refusal.
7. **Duplicate chunk text collides.** The embedding lookup key is
   `documentId::chunkText` (`rag.ts:164`), so two identical chunks in one
   document resolve to the same index.
8. **No job, queue, retry, cancellation or progress.** A source is marked
   `Indexing`, saved, embedded inline, then saved `Ready`. A request that dies
   mid-embedding leaves the base `Indexing` forever.
9. **Indexes are derived per request** (`knowledge/route.ts:84-122`). There is
   no index record, version, or status of its own, and a source's row takes the
   base's document and chunk counts.
10. **No MCP endpoint, no per-base token, no retrieval run history.** Only
    `GET/POST /api/knowledge` and `POST /api/knowledge/search` exist.
11. **`deleteDocument` does not update counts or status**, and no reindex runs.

## What this changes in the brief

`knowledge-parity.md` §2 describes the current implementation accurately. Two
additions:

- The fake-source problem is broader than "no connector runs": a fake source can
  also produce a plausible index row with borrowed counts, and a base with only
  fake sources returns a successful empty result. That is the shape to remove
  first, because it looks like working software.
- Two form fields are documented as parity features but are inert. They should
  be either implemented or hidden. Shipping a control that does nothing is the
  same class of defect as a "Connected" badge that connects to nothing.

## Limits of this verification

- One embedding provider (Ollama, nomic-embed-text) was available. Provider
  switching, dimension mismatch and the lexical-only path were not exercised at
  runtime.
- No chat model was driven, so the agent answer path and answer synthesis were
  not observed. The `outputMode` finding rests on code and on the absence of any
  synthesis implementation.
- Light theme, spacing and visual states were not checked; this was a
  functionality pass.
- The audit ran against a local dev server with one 4-chunk base. Large-corpus
  behaviour, memory use and the O(n²) re-embedding cost were not measured.
