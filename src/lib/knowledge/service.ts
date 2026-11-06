// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { DatabaseSync } from "node:sqlite";
import { getKnowledgeDb } from "./db";
import { chunkDocument } from "./chunk";
import { embedPinned, EmbeddingUnavailableError } from "./embedding";
import { connectorFor, extractUpload } from "./sources";
import { catalogEntry } from "./catalog";
import { CONNECTION_KINDS, resolveSourceConfig } from "../connections/resolve";
import { getConnection } from "../connections/store";
import { normalizeVector, vectorToBlob } from "./vector";
import { newId, nowIso } from "../store";
import type {
  BaseStatus,
  ChunkRecord,
  DocumentRecord,
  DocumentWithChunks,
  JobEvent,
  JobRecord,
  KnowledgeBaseRecord,
  OutputMode,
  ReasoningEffort,
  SourceItem,
  SourceKind,
  SourceRecord,
  SourceStatus,
} from "./types";
import type {
  KnowledgeBase as LegacyBase,
  KnowledgeDocument,
  KnowledgeSource as LegacySource,
  SearchIndex,
} from "../types";

const EMBED_BATCH = 32;
/** Foundry IQ caps a knowledge base at 10 sources. */
export const MAX_SOURCES_PER_BASE = 10;
/** Foundry's file-source limits, applied to one upload request. */
export const MAX_UPLOAD_FILES = 200;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function toBase(row: Record<string, unknown>): KnowledgeBaseRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    connectionId: row.connection_id ? String(row.connection_id) : null,
    chatModel: row.chat_model ? String(row.chat_model) : null,
    reasoningEffort: (String(row.reasoning_effort || "minimal") as ReasoningEffort),
    outputMode: (String(row.output_mode || "extractiveData") as OutputMode),
    retrievalInstructions: String(row.retrieval_instructions ?? ""),
    answerInstructions: String(row.answer_instructions ?? ""),
    encryption: parseJson(row.encryption_json, null),
    indexName: String(row.index_name),
    embeddingModel: row.embedding_model ? String(row.embedding_model) : null,
    embeddingProvider: row.embedding_provider ? String(row.embedding_provider) : null,
    embeddingDim: row.embedding_dim ? Number(row.embedding_dim) : null,
    status: String(row.status || "ready") as BaseStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toSource(row: Record<string, unknown>): SourceRecord {
  return {
    id: String(row.id),
    baseId: String(row.base_id),
    connectionId: row.connection_id ? String(row.connection_id) : null,
    kind: String(row.kind) as SourceKind,
    mode: String(row.mode || "indexed") as SourceRecord["mode"],
    name: String(row.name),
    description: String(row.description ?? ""),
    status: String(row.status || "notConfigured") as SourceStatus,
    config: parseJson(row.config_json, {}),
    indexName: row.index_name ? String(row.index_name) : null,
    alwaysQuery: Number(row.always_query ?? 1) === 1,
    resultsProcessing: String(row.results_processing || "rerank") as "rerank" | "none",
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toDocument(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    baseId: String(row.base_id),
    sourceId: String(row.source_id),
    externalId: String(row.external_id),
    title: String(row.title),
    mime: String(row.mime),
    uri: row.uri ? String(row.uri) : null,
    size: Number(row.size ?? 0),
    contentHash: String(row.content_hash),
    metadata: parseJson(row.metadata_json, {}),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toChunk(row: Record<string, unknown>): ChunkRecord {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    baseId: String(row.base_id),
    sourceId: String(row.source_id),
    ordinal: Number(row.ordinal),
    text: String(row.text),
    heading: row.heading ? String(row.heading) : null,
    page: row.page == null ? null : Number(row.page),
    section: row.section ? String(row.section) : null,
    charStart: row.char_start == null ? null : Number(row.char_start),
    charEnd: row.char_end == null ? null : Number(row.char_end),
    tokenCount: Number(row.token_count ?? 0),
    chunkHash: String(row.chunk_hash),
  };
}

function toJob(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    baseId: String(row.base_id),
    sourceId: row.source_id ? String(row.source_id) : null,
    kind: String(row.kind) as JobRecord["kind"],
    status: String(row.status) as JobRecord["status"],
    stage: row.stage ? String(row.stage) : null,
    totalItems: Number(row.total_items ?? 0),
    doneItems: Number(row.done_items ?? 0),
    attempts: Number(row.attempts ?? 0),
    cancelRequested: Number(row.cancel_requested ?? 0) === 1,
    error: row.error ? String(row.error) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    createdAt: String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listBaseRecords(): Promise<KnowledgeBaseRecord[]> {
  const db = await getKnowledgeDb();
  const rows = db.prepare("SELECT * FROM bases ORDER BY created_at DESC").all();
  return rows.map((row) => toBase(row as Record<string, unknown>));
}

export async function getBaseRecord(id: string): Promise<KnowledgeBaseRecord | null> {
  const db = await getKnowledgeDb();
  const row = db.prepare("SELECT * FROM bases WHERE id = ?").get(id);
  return row ? toBase(row as Record<string, unknown>) : null;
}

export async function listSourceRecords(baseId: string): Promise<SourceRecord[]> {
  const db = await getKnowledgeDb();
  const rows = db
    .prepare("SELECT * FROM sources WHERE base_id = ? ORDER BY created_at ASC")
    .all(baseId);
  return rows.map((row) => toSource(row as Record<string, unknown>));
}

export async function getSourceRecord(
  baseId: string,
  sourceId: string
): Promise<SourceRecord | null> {
  const db = await getKnowledgeDb();
  const row = db
    .prepare("SELECT * FROM sources WHERE base_id = ? AND id = ?")
    .get(baseId, sourceId);
  return row ? toSource(row as Record<string, unknown>) : null;
}

export async function listDocumentsWithChunks(
  baseId: string
): Promise<DocumentWithChunks[]> {
  const db = await getKnowledgeDb();
  const docs = db
    .prepare(
      "SELECT * FROM documents WHERE base_id = ? AND deleted_at IS NULL ORDER BY created_at ASC"
    )
    .all(baseId)
    .map((row) => toDocument(row as Record<string, unknown>));
  if (docs.length === 0) return [];
  const chunks = db
    .prepare("SELECT * FROM chunks WHERE base_id = ? ORDER BY ordinal ASC")
    .all(baseId)
    .map((row) => toChunk(row as Record<string, unknown>));
  const byDoc = new Map<string, ChunkRecord[]>();
  for (const chunk of chunks) {
    const list = byDoc.get(chunk.documentId) || [];
    list.push(chunk);
    byDoc.set(chunk.documentId, list);
  }
  return docs.map((doc) => ({ ...doc, chunks: byDoc.get(doc.id) || [] }));
}

/** A source in another base that can be attached to a new base. */
export interface ReusableSourceRecord {
  id: string;
  baseId: string;
  baseName: string;
  name: string;
  description: string;
  kind: SourceKind;
  mode: SourceRecord["mode"];
  status: SourceStatus;
  connectionId: string | null;
  /** Non-secret configuration only. */
  config: Record<string, unknown>;
  documentCount: number;
  lastSyncedAt: string | null;
}

const SAFE_CONFIG_KEYS = new Set([
  "accessKeyId",
  "apiVersion",
  "bucket",
  "container",
  "contentField",
  "delimiter",
  "endpoint",
  "exclude",
  "folderId",
  "followLinks",
  "include",
  "index",
  "maxBytes",
  "maxFileBytes",
  "maxFiles",
  "maxObjectBytes",
  "maxObjects",
  "maxPages",
  "path",
  "prefix",
  "queryArgument",
  "queryFormat",
  "recursive",
  "region",
  "rows",
  "semanticConfiguration",
  "serverId",
  "table",
  "textColumns",
  "titleColumn",
  "titleField",
  "tool",
  "uriField",
  "urls",
]);

/**
 * Source config may predate the connection vault. Only copy keys the catalog
 * knows about and that are not credentials, so reuse can never expose a secret.
 */
export function sanitizeSourceConfig(
  kind: SourceKind,
  config: Record<string, unknown>
): Record<string, unknown> {
  const entry = catalogEntry(kind);
  const allowed = new Set(SAFE_CONFIG_KEYS);
  for (const field of entry?.fields || []) allowed.add(field.key);
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => allowed.has(key))
  );
}

/** Every configured source that can be reused, with secrets stripped. */
export async function listReusableSources(): Promise<ReusableSourceRecord[]> {
  const db = await getKnowledgeDb();
  const rows = db
    .prepare(
      `SELECT s.*, b.name AS base_name,
         (SELECT COUNT(*) FROM documents d
          WHERE d.source_id = s.id AND d.deleted_at IS NULL) AS document_count
       FROM sources s JOIN bases b ON b.id = s.base_id
       ORDER BY b.created_at DESC, s.created_at ASC`
    )
    .all() as Record<string, unknown>[];
  return rows.map((row) => {
    const source = toSource(row);
    return {
      id: source.id,
      baseId: source.baseId,
      baseName: String(row.base_name),
      name: source.name,
      description: source.description,
      kind: source.kind,
      mode: source.mode,
      status: source.status,
      connectionId: source.connectionId ?? null,
      config: sanitizeSourceConfig(source.kind, source.config),
      documentCount: Number(row.document_count ?? 0),
      lastSyncedAt: source.lastSyncedAt ?? null,
    };
  });
}

/**
 * Attach an existing source to another base without asking for credentials
 * again. The source definition, connection reference and indexed content are
 * copied into the target base; remote sources only need the definition because
 * they are queried live. This is a snapshot, not a live link: later syncs of
 * the original source do not rewrite the copy.
 */
export async function cloneSourceIntoBase(
  targetBaseId: string,
  sourceId: string
): Promise<SourceRecord> {
  const db = await getKnowledgeDb();
  const target = await getBaseRecord(targetBaseId);
  if (!target) throw new Error("Knowledge base not found.");

  const row = db.prepare("SELECT * FROM sources WHERE id = ?").get(sourceId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error("The source you selected no longer exists.");
  const source = toSource(row);

  const existing = await listSourceRecords(targetBaseId);
  if (existing.length >= MAX_SOURCES_PER_BASE) {
    throw new Error(
      `A knowledge base can have at most ${MAX_SOURCES_PER_BASE} sources. Remove one before reusing another.`
    );
  }
  if (existing.some((item) => item.name === source.name && item.kind === source.kind)) {
    throw new Error(
      `"${source.name}" is already attached to this knowledge base.`
    );
  }
  if (CONNECTION_KINDS.has(source.kind)) {
    if (!source.connectionId) {
      throw new Error("This source has no saved connection to reuse.");
    }
    const connection = await getConnection(source.connectionId);
    if (!connection) {
      throw new Error(
        "The connection used by this source no longer exists. Recreate the connection, then reuse the source."
      );
    }
  }

  const sourceBase = await getBaseRecord(source.baseId);
  if (
    source.mode === "indexed" &&
    target.embeddingModel &&
    sourceBase?.embeddingModel &&
    target.embeddingModel !== sourceBase.embeddingModel
  ) {
    throw new Error(
      `This base uses ${target.embeddingModel}, but the source was indexed with ${sourceBase.embeddingModel}. Reuse it into a new base before indexing other content.`
    );
  }

  const newSourceId = newId("src");
  const now = nowIso();
  const config = sanitizeSourceConfig(source.kind, source.config);
  const indexName =
    source.mode === "indexed"
      ? `${target.indexName.replace(/-index$/, "")}-${newSourceId.slice(-6)}`
      : null;

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO sources (id, base_id, connection_id, kind, mode, name, description,
         status, config_json, index_name, always_query, results_processing,
         last_synced_at, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newSourceId,
      targetBaseId,
      source.connectionId || null,
      source.kind,
      source.mode,
      source.name,
      source.description,
      source.status,
      JSON.stringify(config),
      indexName,
      source.alwaysQuery ? 1 : 0,
      source.resultsProcessing,
      source.lastSyncedAt,
      source.lastError,
      now,
      now
    );

    if (source.mode === "indexed") {
      if (!target.embeddingModel && sourceBase?.embeddingModel) {
        db.prepare(
          `UPDATE bases SET embedding_model = ?, embedding_provider = ?,
             embedding_dim = ?, updated_at = ? WHERE id = ?`
        ).run(
          sourceBase.embeddingModel,
          sourceBase.embeddingProvider,
          sourceBase.embeddingDim,
          now,
          targetBaseId
        );
      }

      const documents = db
        .prepare(
          "SELECT * FROM documents WHERE source_id = ? AND deleted_at IS NULL ORDER BY created_at ASC"
        )
        .all(source.id) as Record<string, unknown>[];
      for (const document of documents) {
        const newDocumentId = newId("doc");
        db.prepare(
          `INSERT INTO documents (id, base_id, source_id, external_id, title, mime, uri,
             size, content_hash, metadata_json, deleted_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        ).run(
          newDocumentId,
          targetBaseId,
          newSourceId,
          String(document.external_id),
          String(document.title),
          String(document.mime),
          document.uri ? String(document.uri) : null,
          Number(document.size ?? 0),
          String(document.content_hash),
          String(document.metadata_json || "{}"),
          String(document.created_at),
          String(document.updated_at)
        );

        const chunks = db
          .prepare("SELECT * FROM chunks WHERE document_id = ? ORDER BY ordinal ASC")
          .all(String(document.id)) as Record<string, unknown>[];
        for (const chunk of chunks) {
          const newChunkId = newId("chk");
          db.prepare(
            `INSERT INTO chunks (id, document_id, base_id, source_id, ordinal, text,
               heading, page, section, char_start, char_end, token_count, chunk_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            newChunkId,
            newDocumentId,
            targetBaseId,
            newSourceId,
            Number(chunk.ordinal ?? 0),
            String(chunk.text),
            chunk.heading ? String(chunk.heading) : null,
            chunk.page == null ? null : Number(chunk.page),
            chunk.section ? String(chunk.section) : null,
            chunk.char_start == null ? null : Number(chunk.char_start),
            chunk.char_end == null ? null : Number(chunk.char_end),
            Number(chunk.token_count ?? 0),
            String(chunk.chunk_hash)
          );
          db.prepare(
            "INSERT INTO chunks_fts (text, heading, chunk_id) VALUES (?, ?, ?)"
          ).run(
            String(chunk.text),
            chunk.heading ? String(chunk.heading) : null,
            newChunkId
          );
          const vector = db
            .prepare("SELECT model, dim, vec FROM vectors WHERE chunk_id = ?")
            .get(String(chunk.id)) as
            | { model: string; dim: number; vec: Uint8Array }
            | undefined;
          if (vector) {
            db.prepare(
              "INSERT INTO vectors (chunk_id, model, dim, vec) VALUES (?, ?, ?, ?)"
            ).run(newChunkId, vector.model, vector.dim, vector.vec);
          }
        }
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return (await getSourceRecord(targetBaseId, newSourceId))!;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateBaseInput {
  name: string;
  description?: string;
  chatModel?: string;
  reasoningEffort?: ReasoningEffort;
  outputMode?: OutputMode;
  retrievalInstructions?: string;
  answerInstructions?: string;
  connectionId?: string;
  encryption?: KnowledgeBaseRecord["encryption"];
}

export async function createBase(input: CreateBaseInput): Promise<KnowledgeBaseRecord> {
  const db = await getKnowledgeDb();
  const now = nowIso();
  const id = newId("kb");
  const slug = (input.name || "knowledge-base")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  db.prepare(
    `INSERT INTO bases (id, name, description, connection_id, chat_model,
       reasoning_effort, output_mode, retrieval_instructions, answer_instructions,
       encryption_json, index_name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`
  ).run(
    id,
    input.name.trim(),
    input.description?.trim() || "",
    input.connectionId || null,
    input.chatModel || null,
    input.reasoningEffort || "minimal",
    input.outputMode || "extractiveData",
    input.retrievalInstructions || "",
    input.answerInstructions || "",
    input.encryption ? JSON.stringify(input.encryption) : null,
    `${slug || "knowledge-base"}-index`,
    now,
    now
  );
  return (await getBaseRecord(id))!;
}

export async function updateBase(
  id: string,
  patch: Partial<CreateBaseInput> & { name?: string }
): Promise<KnowledgeBaseRecord> {
  const db = await getKnowledgeDb();
  const current = await getBaseRecord(id);
  if (!current) throw new Error("Knowledge base not found.");
  const next = {
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    chatModel: patch.chatModel ?? current.chatModel,
    connectionId: patch.connectionId ?? current.connectionId,
    reasoningEffort: patch.reasoningEffort ?? current.reasoningEffort,
    outputMode: patch.outputMode ?? current.outputMode,
    retrievalInstructions:
      patch.retrievalInstructions ?? current.retrievalInstructions,
    answerInstructions: patch.answerInstructions ?? current.answerInstructions,
    encryption: patch.encryption ?? current.encryption,
  };
  db.prepare(
    `UPDATE bases SET name = ?, description = ?, connection_id = ?, chat_model = ?,
       reasoning_effort = ?, output_mode = ?, retrieval_instructions = ?,
       answer_instructions = ?, encryption_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    next.name.trim(),
    next.description,
    next.connectionId || null,
    next.chatModel || null,
    next.reasoningEffort,
    next.outputMode,
    next.retrievalInstructions,
    next.answerInstructions,
    next.encryption ? JSON.stringify(next.encryption) : null,
    nowIso(),
    id
  );
  return (await getBaseRecord(id))!;
}

export async function deleteBase(id: string): Promise<void> {
  const db = await getKnowledgeDb();
  const chunkIds = db
    .prepare("SELECT id FROM chunks WHERE base_id = ?")
    .all(id) as { id: string }[];
  db.exec("BEGIN");
  try {
    for (const row of chunkIds) {
      db.prepare("DELETE FROM chunks_fts WHERE chunk_id = ?").run(row.id);
    }
    db.prepare("DELETE FROM bases WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function addSource(input: {
  baseId: string;
  kind: SourceKind;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
  connectionId?: string;
}): Promise<SourceRecord> {
  const db = await getKnowledgeDb();
  const base = await getBaseRecord(input.baseId);
  if (!base) throw new Error("Knowledge base not found.");
  const existing = await listSourceRecords(input.baseId);
  if (existing.length >= MAX_SOURCES_PER_BASE) {
    throw new Error(
      `A knowledge base can have at most ${MAX_SOURCES_PER_BASE} sources, matching Foundry IQ. Remove one before adding another.`
    );
  }
  const connector = connectorFor(input.kind);
  const mode = connector
    ? connector.mode
    : input.kind === "azure-ai-search" || input.kind === "mcp" || input.kind === "http"
    ? "remote"
    : "unavailable";
  const config = input.config || {};

  if (CONNECTION_KINDS.has(input.kind)) {
    if (!input.connectionId) {
      throw new Error(
        "Choose a connection for this source. Connections keep the credential out of the source and let several sources share it."
      );
    }
    const connection = await getConnection(input.connectionId);
    if (!connection) throw new Error("That connection no longer exists.");
    if (connection.provider !== input.kind) {
      throw new Error(
        `This source needs a ${input.kind} connection, but "${connection.name}" is ${connection.provider}.`
      );
    }
  }

  // A connection that exists but is not connected yet (OAuth) is a reason to
  // create the source as "not configured", not to refuse it.
  let validation: string | null = null;
  if (input.kind === "azure-ai-search" && !String(config.index || "").trim()) {
    validation = "An index name is required.";
  }
  if (input.kind === "mcp") {
    if (!String(config.serverId || "").trim()) {
      validation = "Choose an MCP server.";
    } else if (!String(config.tool || "").trim()) {
      validation = "Choose a tool on the MCP server.";
    }
  }
  try {
    const resolved = await resolveSourceConfig({
      config,
      connectionId: input.connectionId,
    });
    const checked = connector ? connector.validate(resolved) : null;
    if (checked) validation = checked;
  } catch (error) {
    validation = error instanceof Error ? error.message : String(error);
  }
  const now = nowIso();
  const id = newId("src");
  const status: SourceStatus = validation
    ? "notConfigured"
    : mode === "remote"
    ? "remote"
    : mode === "unavailable"
    ? "unavailable"
    : "notConfigured";
  db.prepare(
    `INSERT INTO sources (id, base_id, connection_id, kind, mode, name, description,
       status, config_json, index_name, always_query, results_processing, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'rerank', ?, ?)`
  ).run(
    id,
    input.baseId,
    input.connectionId || null,
    input.kind,
    mode,
    input.name.trim(),
    input.description?.trim() || "",
    status,
    JSON.stringify(config),
    mode === "indexed" ? `${base.indexName.replace(/-index$/, "")}-${id.slice(-6)}` : null,
    now,
    now
  );
  if (validation) {
    db.prepare("UPDATE sources SET last_error = ? WHERE id = ?").run(validation, id);
  }
  return (await getSourceRecord(input.baseId, id))!;
}

export async function updateSourceConfig(
  baseId: string,
  sourceId: string,
  patch: {
    name?: string;
    description?: string;
    config?: Record<string, unknown>;
    connectionId?: string;
  }
): Promise<SourceRecord> {
  const db = await getKnowledgeDb();
  const source = await getSourceRecord(baseId, sourceId);
  if (!source) throw new Error("Knowledge source not found.");
  const config = patch.config ?? source.config;
  const connectionId =
    patch.connectionId === undefined ? source.connectionId : patch.connectionId;
  const connector = connectorFor(source.kind);
  const resolved = await resolveSourceConfig({
    config,
    connectionId: connectionId || null,
  });
  const validation = connector ? connector.validate(resolved) : null;
  db.prepare(
    `UPDATE sources SET name = ?, description = ?, config_json = ?, connection_id = ?,
       status = ?, last_error = ?, updated_at = ? WHERE id = ?`
  ).run(
    patch.name?.trim() || source.name,
    patch.description ?? source.description,
    JSON.stringify(config),
    connectionId || null,
    validation
      ? "notConfigured"
      : source.status === "unavailable"
      ? "unavailable"
      : "notConfigured",
    validation,
    nowIso(),
    sourceId
  );
  return (await getSourceRecord(baseId, sourceId))!;
}

/**
 * Deleting a source removes its documents, chunks, vectors and FTS rows.
 * "Remove from knowledge base" and "Delete permanently" are the same operation
 * here because a local source is not shared between bases.
 */
export async function deleteSource(baseId: string, sourceId: string): Promise<void> {
  const db = await getKnowledgeDb();
  const chunkIds = db
    .prepare("SELECT id FROM chunks WHERE base_id = ? AND source_id = ?")
    .all(baseId, sourceId) as { id: string }[];
  db.exec("BEGIN");
  try {
    for (const row of chunkIds) {
      db.prepare("DELETE FROM chunks_fts WHERE chunk_id = ?").run(row.id);
    }
    db.prepare("DELETE FROM sources WHERE base_id = ? AND id = ?").run(baseId, sourceId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function deleteDocument(baseId: string, documentId: string): Promise<void> {
  const db = await getKnowledgeDb();
  const chunkIds = db
    .prepare("SELECT id FROM chunks WHERE document_id = ?")
    .all(documentId) as { id: string }[];
  db.exec("BEGIN");
  try {
    for (const row of chunkIds) {
      db.prepare("DELETE FROM chunks_fts WHERE chunk_id = ?").run(row.id);
    }
    db.prepare("DELETE FROM documents WHERE id = ? AND base_id = ?").run(documentId, baseId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

function logEvent(
  db: DatabaseSync,
  jobId: string,
  level: JobEvent["level"],
  stage: string,
  message: string,
  data?: Record<string, unknown>
): void {
  db.prepare(
    "INSERT INTO job_events (job_id, at, level, stage, message, data_json) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(jobId, nowIso(), level, stage, message, data ? JSON.stringify(data) : null);
}

export async function listJobs(baseId: string): Promise<JobRecord[]> {
  const db = await getKnowledgeDb();
  return db
    .prepare("SELECT * FROM jobs WHERE base_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(baseId)
    .map((row) => toJob(row as Record<string, unknown>));
}

export async function jobEvents(jobId: string): Promise<JobEvent[]> {
  const db = await getKnowledgeDb();
  return db
    .prepare("SELECT * FROM job_events WHERE job_id = ? ORDER BY id ASC")
    .all(jobId)
    .map((row) => ({
      id: Number(row.id),
      jobId: String(row.job_id),
      at: String(row.at),
      level: String(row.level) as JobEvent["level"],
      stage: row.stage ? String(row.stage) : null,
      message: String(row.message),
      data: parseJson(row.data_json, null),
    }));
}

export async function cancelJob(baseId: string, jobId: string): Promise<void> {
  const db = await getKnowledgeDb();
  db.prepare(
    "UPDATE jobs SET cancel_requested = 1 WHERE id = ? AND base_id = ? AND status IN ('queued','running')"
  ).run(jobId, baseId);
}

function finishSource(
  db: DatabaseSync,
  base: KnowledgeBaseRecord,
  sourceId: string,
  status: SourceStatus,
  error: string | null,
  embedding: { model: string; provider: string; dim: number } | null
): void {
  const now = nowIso();
  db.prepare(
    "UPDATE sources SET status = ?, last_error = ?, last_synced_at = ?, updated_at = ? WHERE id = ?"
  ).run(status, error, now, now, sourceId);
  if (embedding) {
    db.prepare(
      "UPDATE bases SET embedding_model = ?, embedding_provider = ?, embedding_dim = ?, updated_at = ? WHERE id = ?"
    ).run(embedding.model, embedding.provider, embedding.dim, now, base.id);
  }
}

/**
 * Inserts or updates one document. Content hash is the identity: unchanged
 * content skips extraction, chunking and embedding entirely.
 */
async function upsertItem(
  db: DatabaseSync,
  base: KnowledgeBaseRecord,
  source: SourceRecord,
  item: SourceItem
): Promise<{ outcome: "created" | "updated" | "unchanged" | "skipped"; embed?: { model: string; provider: string; dim: number } }> {
  if (item.mime === "error" || item.mime === "skip" || !item.content.trim()) {
    return { outcome: "skipped" };
  }
  const contentHash = hash(item.content);
  const existing = db
    .prepare("SELECT * FROM documents WHERE source_id = ? AND external_id = ?")
    .get(source.id, item.externalId) as Record<string, unknown> | undefined;

  if (existing && String(existing.content_hash) === contentHash && !existing.deleted_at) {
    return { outcome: "unchanged" };
  }

  const docId = existing ? String(existing.id) : newId("doc");
  const now = nowIso();
  if (existing) {
    db.prepare(
      `UPDATE documents SET title = ?, mime = ?, uri = ?, size = ?, content_hash = ?,
         metadata_json = ?, deleted_at = NULL, updated_at = ? WHERE id = ?`
    ).run(
      item.title,
      item.mime,
      item.uri || null,
      item.size,
      contentHash,
      JSON.stringify(item.metadata || {}),
      now,
      docId
    );
    const oldChunks = db
      .prepare("SELECT id FROM chunks WHERE document_id = ?")
      .all(docId) as { id: string }[];
    for (const row of oldChunks) {
      db.prepare("DELETE FROM chunks_fts WHERE chunk_id = ?").run(row.id);
    }
    db.prepare("DELETE FROM chunks WHERE document_id = ?").run(docId);
  } else {
    db.prepare(
      `INSERT INTO documents (id, base_id, source_id, external_id, title, mime, uri,
         size, content_hash, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      docId,
      base.id,
      source.id,
      item.externalId,
      item.title,
      item.mime,
      item.uri || null,
      item.size,
      contentHash,
      JSON.stringify(item.metadata || {}),
      now,
      now
    );
  }

  const drafts = chunkDocument(item.content);
  if (drafts.length === 0) return { outcome: "skipped" };

  const chunkIds = drafts.map(() => newId("chk"));
  let embedded: { model: string; provider: string; dim: number } | null = null;

  const pinned = base.embeddingModel;
  const vectors: Float32Array[] = [];
  for (let start = 0; start < drafts.length; start += EMBED_BATCH) {
    const batch = drafts.slice(start, start + EMBED_BATCH);
    const result = await embedPinned(
      batch.map((draft) => draft.text),
      pinned
    );
    vectors.push(...result.vectors);
    if (!embedded) {
      embedded = { model: result.model, provider: result.provider, dim: result.dim };
    }
  }

  drafts.forEach((draft, index) => {
    db.prepare(
      `INSERT INTO chunks (id, document_id, base_id, source_id, ordinal, text, heading,
         page, section, char_start, char_end, token_count, chunk_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      chunkIds[index],
      docId,
      base.id,
      source.id,
      index,
      draft.text,
      draft.heading,
      draft.page,
      draft.section,
      draft.charStart,
      draft.charEnd,
      draft.tokenCount,
      draft.chunkHash
    );
    db.prepare("INSERT INTO chunks_fts (text, heading, chunk_id) VALUES (?, ?, ?)").run(
      draft.text,
      draft.heading,
      chunkIds[index]
    );
    const vector = vectors[index];
    if (vector) {
      db.prepare(
        "INSERT OR REPLACE INTO vectors (chunk_id, model, dim, vec) VALUES (?, ?, ?, ?)"
      ).run(
        chunkIds[index],
        embedded!.model,
        vector.length,
        vectorToBlob(normalizeVector(Array.from(vector)))
      );
    }
  });

  return { outcome: existing ? "updated" : "created", embed: embedded || undefined };
}

async function finalizeJob(
  db: DatabaseSync,
  jobId: string,
  status: JobRecord["status"],
  error: string | null
): Promise<void> {
  const now = nowIso();
  const job = db.prepare("SELECT cancel_requested FROM jobs WHERE id = ?").get(jobId) as
    | { cancel_requested: number }
    | undefined;
  const finalStatus = job?.cancel_requested ? "cancelled" : status;
  db.prepare(
    "UPDATE jobs SET status = ?, error = ?, finished_at = ?, stage = ? WHERE id = ?"
  ).run(finalStatus, error, now, finalStatus, jobId);
  logEvent(db, jobId, finalStatus === "failed" ? "error" : "info", finalStatus, error || finalStatus);
}

export interface SyncOutcome {
  job: JobRecord;
  documents: number;
  chunks: number;
  skipped: number;
  errors: string[];
  embedding: string | null;
}

/**
 * Runs one source sync. Indexed sources discover items, then each item is
 * hashed, chunked, embedded and written. Remote sources are not synced.
 */
export async function syncSource(
  baseId: string,
  sourceId: string
): Promise<SyncOutcome> {
  const db = await getKnowledgeDb();
  const base = await getBaseRecord(baseId);
  if (!base) throw new Error("Knowledge base not found.");
  const source = await getSourceRecord(baseId, sourceId);
  if (!source) throw new Error("Knowledge source not found.");
  if (source.mode === "unavailable") {
    throw new Error(
      source.lastError ||
        "This source needs an upstream tenant or a connector that is not built yet."
    );
  }
  if (source.mode !== "indexed") {
    throw new Error("This source is queried at retrieval time and cannot be synced.");
  }
  const connector = connectorFor(source.kind);
  if (!connector) throw new Error(`No connector is registered for "${source.kind}".`);
  const resolvedConfig = await resolveSourceConfig(source);
  const validation = connector.validate(resolvedConfig);
  if (validation) throw new Error(validation);

  const jobId = newId("job");
  const now = nowIso();
  db.prepare(
    `INSERT INTO jobs (id, base_id, source_id, kind, status, stage, total_items,
       done_items, attempts, cancel_requested, created_at, started_at)
     VALUES (?, ?, ?, 'sync', 'running', 'discover', 0, 0, 1, 0, ?, ?)`
  ).run(jobId, baseId, sourceId, now, now);
  db.prepare("UPDATE sources SET status = 'indexing', last_error = NULL, updated_at = ? WHERE id = ?")
    .run(now, sourceId);

  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let chunks = 0;
  let embedding: { model: string; provider: string; dim: number } | null = null;

  try {
    logEvent(db, jobId, "info", "discover", `Discovering items for ${source.name}.`);
    const items = await connector.discover({
      config: resolvedConfig,
      onProgress: (done, total, message) => {
        db.prepare("UPDATE jobs SET total_items = ?, done_items = ? WHERE id = ?").run(
          total,
          done,
          jobId
        );
        if (message && done % 25 === 0) {
          logEvent(db, jobId, "info", "discover", `${done}/${total} ${message}`);
        }
      },
    });
    db.prepare("UPDATE jobs SET total_items = ?, stage = 'index' WHERE id = ?").run(
      items.length,
      jobId
    );

    const seen = new Set<string>();
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const cancelled = db
        .prepare("SELECT cancel_requested FROM jobs WHERE id = ?")
        .get(jobId) as { cancel_requested: number } | undefined;
      if (cancelled?.cancel_requested) {
        logEvent(db, jobId, "warn", "cancel", "Cancellation requested.");
        break;
      }
      seen.add(item.externalId);
      try {
        if (item.mime === "error") {
          const reason = String(item.metadata?.error || "Fetch failed");
          errors.push(`${item.externalId}: ${reason}`);
          logEvent(db, jobId, "error", "fetch", `${item.externalId}: ${reason}`);
        } else {
          const result = await upsertItem(db, base, source, item);
          if (result.outcome === "created") created += 1;
          else if (result.outcome === "updated") updated += 1;
          else if (result.outcome === "unchanged") unchanged += 1;
          else skipped += 1;
          if (result.embed) embedding = result.embed;
        }
      } catch (error) {
        if (error instanceof EmbeddingUnavailableError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${item.externalId}: ${message}`);
        logEvent(db, jobId, "error", "index", `${item.externalId}: ${message}`);
      }
      db.prepare("UPDATE jobs SET done_items = ? WHERE id = ?").run(index + 1, jobId);
    }

    // Deletion propagation: documents not seen in this run are removed.
    const existingDocs = db
      .prepare("SELECT id, external_id FROM documents WHERE source_id = ?")
      .all(sourceId) as { id: string; external_id: string }[];
    for (const doc of existingDocs) {
      if (seen.has(doc.external_id)) continue;
      const staleChunks = db
        .prepare("SELECT id FROM chunks WHERE document_id = ?")
        .all(doc.id) as { id: string }[];
      for (const row of staleChunks) {
        db.prepare("DELETE FROM chunks_fts WHERE chunk_id = ?").run(row.id);
      }
      db.prepare("DELETE FROM documents WHERE id = ?").run(doc.id);
    }

    chunks = Number(
      (
        db
          .prepare("SELECT COUNT(*) AS n FROM chunks WHERE source_id = ?")
          .get(sourceId) as { n: number }
      ).n
    );

    const totalSucceeded = created + updated + unchanged;
    const status: SourceStatus =
      errors.length > 0 && totalSucceeded === 0
        ? "failed"
        : errors.length > 0
        ? "readyWithErrors"
        : "ready";
    finishSource(
      db,
      base,
      sourceId,
      status,
      errors.length ? errors.slice(0, 5).join(" | ") : null,
      embedding
    );
    logEvent(db, jobId, "info", status, `Indexed ${created + updated} document(s), ${chunks} chunk(s).`, {
      created,
      updated,
      unchanged,
      skipped,
      errors: errors.length,
    });
    await finalizeJob(
      db,
      jobId,
      status === "failed" ? "failed" : status === "readyWithErrors" ? "partial" : "succeeded",
      errors[0] || null
    );
    return {
      job: (await listJobs(baseId)).find((job) => job.id === jobId)!,
      documents: created + updated,
      chunks,
      skipped: skipped + unchanged,
      errors,
      embedding: embedding?.model || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishSource(db, base, sourceId, "failed", message, null);
    await finalizeJob(db, jobId, "failed", message);
    return {
      job: (await listJobs(baseId)).find((job) => job.id === jobId)!,
      documents: created + updated,
      chunks,
      skipped: skipped + unchanged,
      errors: [...errors, message],
      embedding: embedding?.model || null,
    };
  }
}

/**
 * Writes uploaded buffers into a `file` source. Text extraction happens here so
 * the same extraction path serves the API and the UI.
 */
export async function ingestUploads(
  baseId: string,
  files: { name: string; buffer: Buffer; mime: string }[]
): Promise<SyncOutcome> {
  const db = await getKnowledgeDb();
  const base = await getBaseRecord(baseId);
  if (!base) throw new Error("Knowledge base not found.");
  if (files.length > MAX_UPLOAD_FILES) {
    throw new Error(
      `A single upload can contain at most ${MAX_UPLOAD_FILES} files.`
    );
  }
  const oversized = files.find((file) => file.buffer.byteLength > MAX_UPLOAD_BYTES);
  if (oversized) {
    throw new Error(
      `${oversized.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`
    );
  }
  let source = (await listSourceRecords(baseId)).find(
    (item) => item.kind === "file" && item.name === "Files"
  );
  if (!source) {
    source = await addSource({ baseId, kind: "file", name: "Files", config: {} });
  }
  source = { ...source, config: source.config };

  const jobId = newId("job");
  const now = nowIso();
  db.prepare(
    `INSERT INTO jobs (id, base_id, source_id, kind, status, stage, total_items,
       done_items, attempts, cancel_requested, created_at, started_at)
     VALUES (?, ?, ?, 'sync', 'running', 'extract', ?, 0, 1, 0, ?, ?)`
  ).run(jobId, baseId, source.id, files.length, now, now);
  db.prepare("UPDATE sources SET status = 'indexing', updated_at = ? WHERE id = ?")
    .run(now, source.id);

  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let chunks = 0;
  let embedding: { model: string; provider: string; dim: number } | null = null;

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const extracted = await extractUpload(file.name, file.buffer, file.mime);
        const result = await upsertItem(db, base, source, {
          externalId: file.name,
          title: file.name,
          mime: extracted.mime,
          uri: `upload://${file.name}`,
          size: file.buffer.byteLength,
          content: extracted.text,
          metadata: { uploaded: true, extraction: extracted.kind },
        });
        if (result.outcome === "created") created += 1;
        if (result.outcome === "updated") updated += 1;
        if (result.embed) embedding = result.embed;
      } catch (error) {
        if (error instanceof EmbeddingUnavailableError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${file.name}: ${message}`);
        logEvent(db, jobId, "error", "extract", `${file.name}: ${message}`);
      }
      db.prepare("UPDATE jobs SET done_items = ? WHERE id = ?").run(index + 1, jobId);
    }
    chunks = Number(
      (
        db
          .prepare("SELECT COUNT(*) AS n FROM chunks WHERE source_id = ?")
          .get(source.id) as { n: number }
      ).n
    );
    const status: SourceStatus =
      errors.length && created + updated === 0
        ? "failed"
        : errors.length
        ? "readyWithErrors"
        : "ready";
    finishSource(
      db,
      base,
      source.id,
      status,
      errors.length ? errors.slice(0, 5).join(" | ") : null,
      embedding
    );
    await finalizeJob(
      db,
      jobId,
      status === "failed" ? "failed" : status === "readyWithErrors" ? "partial" : "succeeded",
      errors[0] || null
    );
    return {
      job: (await listJobs(baseId)).find((job) => job.id === jobId)!,
      documents: created + updated,
      chunks,
      skipped: 0,
      errors,
      embedding: embedding?.model || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishSource(db, base, source.id, "failed", message, null);
    await finalizeJob(db, jobId, "failed", message);
    return {
      job: (await listJobs(baseId)).find((job) => job.id === jobId)!,
      documents: created + updated,
      chunks,
      skipped: 0,
      errors: [...errors, message],
      embedding: embedding?.model || null,
    };
  }
}

/** Adds pasted text as a file document. */
export async function ingestPastedText(
  baseId: string,
  name: string,
  text: string
): Promise<SyncOutcome> {
  return ingestUploads(baseId, [
    { name: name || "pasted-text.txt", buffer: Buffer.from(text, "utf8"), mime: "text/plain" },
  ]);
}

// ---------------------------------------------------------------------------
// MCP tokens
// ---------------------------------------------------------------------------

/** Issues (or rotates) a bearer token for a base's MCP endpoint. */
export async function issueMcpToken(baseId: string): Promise<string> {
  const db = await getKnowledgeDb();
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  db.prepare(
    `INSERT INTO mcp_tokens (base_id, token_hash, created_at) VALUES (?, ?, ?)
     ON CONFLICT(base_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at`
  ).run(baseId, hash, nowIso());
  return token;
}

export async function verifyMcpToken(baseId: string, token: string): Promise<boolean> {
  if (!token) return false;
  const db = await getKnowledgeDb();
  const row = db
    .prepare("SELECT token_hash FROM mcp_tokens WHERE base_id = ?")
    .get(baseId) as { token_hash: string } | undefined;
  if (!row) return false;
  const stored = Buffer.from(row.token_hash, "hex");
  const given = Buffer.from(createHash("sha256").update(token).digest("hex"), "hex");
  return stored.length === given.length && timingSafeEqual(stored, given);
}

// ---------------------------------------------------------------------------
// Legacy API compatibility
// ---------------------------------------------------------------------------

const LEGACY_KIND: Record<string, LegacySource["kind"]> = {
  file: "upload",
  folder: "upload",
  git: "upload",
  csv: "upload",
  sqlite: "azure-blob",
  "azure-blob": "azure-blob",
  gcs: "azure-blob",
  s3: "azure-blob",
  webdav: "azure-blob",
  sftp: "azure-blob",
  web: "web",
  "azure-ai-search": "azure-ai-search",
  mcp: "azure-ai-search",
  "work-iq": "work-iq",
  "fabric-data-agent": "fabric-iq",
  "fabric-ontology": "fabric-iq",
  "sharepoint-remote": "fabric-iq",
  "sharepoint-indexed": "fabric-iq",
  onelake: "fabric-iq",
};

const STATUS_LABEL: Record<SourceStatus, LegacySource["status"]> = {
  notConfigured: "Not configured" as LegacySource["status"],
  indexing: "Indexing",
  ready: "Ready",
  readyWithErrors: "Ready with errors" as LegacySource["status"],
  failed: "Error",
  cancelled: "Cancelled" as LegacySource["status"],
  remote: "Remote" as LegacySource["status"],
  unavailable: "Unavailable" as LegacySource["status"],
};

const BASE_STATUS: Record<BaseStatus, LegacyBase["status"]> = {
  ready: "Ready",
  indexing: "Indexing",
  readyWithErrors: "Ready",
  failed: "Failed",
};

export async function legacyKnowledge(): Promise<{
  knowledgeBases: LegacyBase[];
  indexes: SearchIndex[];
}> {
  const bases = await listBaseRecords();
  const out: LegacyBase[] = [];
  const indexes: SearchIndex[] = [];

  for (const base of bases) {
    const sources = await listSourceRecords(base.id);
    const docs = await listDocumentsWithChunks(base.id);

    out.push({
      id: base.id,
      name: base.name,
      description: base.description,
      connectionId: base.connectionId || undefined,
      chatModel: base.chatModel || undefined,
      reasoningEffort:
        base.reasoningEffort === "low"
          ? "Low"
          : base.reasoningEffort === "medium"
          ? "Medium"
          : "Minimal",
      outputMode:
        base.outputMode === "answerSynthesis" ? "Answer synthesis" : "Extractive data",
      retrievalInstructions: base.retrievalInstructions,
      sources: sources.map((source) => ({
        id: source.id,
        kind: LEGACY_KIND[source.kind] || "upload",
        name: source.name,
        detail: source.lastError || source.description || (source.mode === "remote" ? "Queried live" : ""),
        status: STATUS_LABEL[source.status],
        indexName: source.indexName || undefined,
        documentCount: docs.filter((doc) => doc.sourceId === source.id).length,
      })),
      encryption: base.encryption || { enabled: false },
      indexName: base.indexName,
      embeddingModel: base.embeddingModel || "lexical",
      embeddingProvider: (base.embeddingProvider || "lexical") as LegacyBase["embeddingProvider"],
      status: BASE_STATUS[base.status],
      documents: docs.map((doc) => ({
        id: doc.id,
        name: doc.title,
        size: doc.size,
        type: doc.mime,
        text: doc.chunks.map((chunk) => chunk.text).join("\n\n"),
        chunks: doc.chunks.map((chunk) => chunk.text),
        embeddings: undefined,
        addedAt: doc.createdAt,
      })) as KnowledgeDocument[],
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    } as LegacyBase);

    // Indexes are real rows, counted per source, never borrowed from the base.
    for (const source of sources) {
      if (source.mode !== "indexed") continue;
      const sourceDocs = docs.filter((doc) => doc.sourceId === source.id);
      if (sourceDocs.length === 0 && source.status !== "indexing") continue;
      indexes.push({
        id: `${base.id}:${source.id}`,
        name: source.indexName || base.indexName,
        version: 1,
        type: source.kind === "file" ? "File search" : "Agentic retrieval",
        documents: sourceDocs.length,
        chunks: sourceDocs.reduce((sum, doc) => sum + doc.chunks.length, 0),
        status:
          source.status === "indexing"
            ? "Indexing"
            : source.status === "failed"
            ? "Failed"
            : "Ready",
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      });
    }
  }

  return { knowledgeBases: out, indexes };
}
