// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { DatabaseSync } from "node:sqlite";
import { promises as fs } from "fs";
import path from "path";
import { dataDir, readJson } from "../store";
import type { KnowledgeBase as LegacyBase } from "../types";
import { normalizeVector, vectorToBlob } from "./vector";

const DB_DIR = path.join(dataDir(), "knowledge");
const DB_FILE = path.join(DB_DIR, "knowledge.db");
const LEGACY_FILE = path.join(dataDir(), "knowledge.json");
const LEGACY_BACKUP = path.join(dataDir(), "knowledge.json.pre-sqlite");

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  connection_id TEXT,
  chat_model TEXT,
  reasoning_effort TEXT NOT NULL DEFAULT 'minimal',
  output_mode TEXT NOT NULL DEFAULT 'extractiveData',
  retrieval_instructions TEXT NOT NULL DEFAULT '',
  answer_instructions TEXT NOT NULL DEFAULT '',
  encryption_json TEXT,
  index_name TEXT NOT NULL,
  embedding_model TEXT,
  embedding_provider TEXT,
  embedding_dim INTEGER,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  base_id TEXT NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
  connection_id TEXT,
  kind TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'indexed',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'notConfigured',
  config_json TEXT NOT NULL DEFAULT '{}',
  index_name TEXT,
  always_query INTEGER NOT NULL DEFAULT 1,
  results_processing TEXT NOT NULL DEFAULT 'rerank',
  last_synced_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_base ON sources(base_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  base_id TEXT NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'text/plain',
  uri TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_documents_base ON documents(base_id);
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_id);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(content_hash);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  base_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  heading TEXT,
  page INTEGER,
  section TEXT,
  char_start INTEGER,
  char_end INTEGER,
  token_count INTEGER NOT NULL DEFAULT 0,
  chunk_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_base ON chunks(base_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text,
  heading,
  chunk_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS vectors (
  chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vec BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  base_id TEXT NOT NULL,
  source_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  done_items INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_base ON jobs(base_id);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  at TEXT NOT NULL,
  level TEXT NOT NULL,
  stage TEXT,
  message TEXT NOT NULL,
  data_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id);

CREATE TABLE IF NOT EXISTS mcp_tokens (
  base_id TEXT PRIMARY KEY REFERENCES bases(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retrieval_runs (
  id TEXT PRIMARY KEY,
  base_id TEXT NOT NULL,
  query TEXT NOT NULL,
  effort TEXT NOT NULL,
  output_mode TEXT NOT NULL,
  plan_json TEXT,
  answer TEXT,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  activity_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_base ON retrieval_runs(base_id);

CREATE TABLE IF NOT EXISTS retrieval_run_refs (
  run_id TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  chunk_id TEXT,
  score REAL,
  reranker_score REAL,
  PRIMARY KEY (run_id, ref_id)
);
`;

interface GlobalWithDb {
  __openfoundryKnowledgeDb?: Promise<DatabaseSync>;
}

const globalStore = globalThis as unknown as GlobalWithDb;

function open(): DatabaseSync {
  const db = new DatabaseSync(DB_FILE);
  db.exec(SCHEMA);
  ensureColumns(db);

  const version = db.prepare("PRAGMA user_version").get() as {
    user_version?: number;
  };
  const current = Number(version?.user_version ?? 0);
  if (current < 1) {
    db.prepare("PRAGMA user_version = 1").run();
  }
  return db;
}

/** Opens the knowledge database once per process, running the one-time import. */
/**
 * Forward migration for databases created before a column existed. Runs on
 * every access because Next's hot reload keeps the connection on globalThis
 * while replacing the module that opened it.
 */
function ensureTables(db: DatabaseSync): void {
  // Cheap idempotent DDL so tables added after the process opened the database
  // exist without reopening it (Next hot reload keeps the connection alive).
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_tokens (
      base_id TEXT PRIMARY KEY REFERENCES bases(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function ensureColumns(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(sources)").all() as {
    name: string;
  }[];
  if (!columns.some((column) => column.name === "connection_id")) {
    db.exec("ALTER TABLE sources ADD COLUMN connection_id TEXT");
  }
}

export async function getKnowledgeDb(): Promise<DatabaseSync> {
  if (!globalStore.__openfoundryKnowledgeDb) {
    globalStore.__openfoundryKnowledgeDb = (async () => {
      await fs.mkdir(DB_DIR, { recursive: true });
      const db = open();
      await importLegacyJson(db);
      return db;
    })();
  }
  const db = await globalStore.__openfoundryKnowledgeDb;
  ensureTables(db);
  ensureColumns(db);
  return db;
}

/** Tests only: drop the singleton so a new path/temporary database is opened. */
export function resetKnowledgeDbForTests(): void {
  delete globalStore.__openfoundryKnowledgeDb;
}

export function knowledgeDbPath(): string {
  return DB_FILE;
}

const KIND_MAP: Record<string, string> = {
  upload: "file",
  "work-iq": "work-iq",
  "fabric-iq": "fabric-data-agent",
  "azure-blob": "azure-blob",
  web: "web",
  "azure-ai-search": "azure-ai-search",
};

const STATUS_MAP: Record<string, string> = {
  Ready: "ready",
  Indexing: "indexing",
  Failed: "failed",
  Error: "failed",
  Connected: "notConfigured",
};

/**
 * Imports `knowledge.json` once. The JSON file is renamed afterwards so a failed
 * half-migration can be retried from the same source.
 */
async function importLegacyJson(db: DatabaseSync): Promise<void> {
  const count = db.prepare("SELECT COUNT(*) AS n FROM bases").get() as { n: number };
  if (Number(count.n) > 0) return;

  let legacy: LegacyBase[] = [];
  try {
    legacy = await readJson<LegacyBase[]>("knowledge.json", []);
  } catch {
    legacy = [];
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return;

  const now = new Date().toISOString();
  const insertBase = db.prepare(`
    INSERT OR IGNORE INTO bases
      (id, name, description, connection_id, chat_model, reasoning_effort,
       output_mode, retrieval_instructions, answer_instructions, encryption_json,
       index_name, embedding_model, embedding_provider, embedding_dim, status,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSource = db.prepare(`
    INSERT OR IGNORE INTO sources
      (id, base_id, kind, mode, name, description, status, config_json,
       index_name, always_query, results_processing, created_at, updated_at)
    VALUES (?, ?, ?, 'indexed', ?, '', ?, '{}', ?, 1, 'rerank', ?, ?)
  `);
  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO documents
      (id, base_id, source_id, external_id, title, mime, uri, size, content_hash,
       metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, '{}', ?, ?)
  `);
  const insertChunk = db.prepare(`
    INSERT OR IGNORE INTO chunks
      (id, document_id, base_id, source_id, ordinal, text, heading, page, section,
       char_start, char_end, token_count, chunk_hash)
    VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
  `);
  const insertFts = db.prepare(
    "INSERT INTO chunks_fts (text, heading, chunk_id) VALUES (?, ?, ?)"
  );
  const insertVector = db.prepare(
    "INSERT OR REPLACE INTO vectors (chunk_id, model, dim, vec) VALUES (?, ?, ?, ?)"
  );

  db.exec("BEGIN");
  try {
    for (const base of legacy) {
      const createdAt = base.createdAt || now;
      insertBase.run(
        base.id,
        base.name,
        base.description || "",
        base.connectionId || null,
        base.chatModel || null,
        String(base.reasoningEffort || "Minimal").toLowerCase(),
        base.outputMode === "Answer synthesis" ? "answerSynthesis" : "extractiveData",
        base.retrievalInstructions || "",
        "",
        base.encryption ? JSON.stringify(base.encryption) : null,
        base.indexName || `${base.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}-index`,
        base.embeddingModel || null,
        base.embeddingProvider || null,
        base.documents?.[0]?.embeddings?.[0]?.length ?? null,
        STATUS_MAP[base.status] || "ready",
        createdAt,
        base.updatedAt || createdAt
      );

      // Legacy documents have no source. Give them one so deletion works.
      const legacySources = (base.sources || []).filter((s) => s.kind === "upload");
      let sourceId = legacySources[0]?.id;
      if (!sourceId) {
        sourceId = `src_legacy_${base.id}`;
        insertSource.run(
          sourceId,
          base.id,
          "file",
          "Files",
          base.documents?.length ? "ready" : "notConfigured",
          base.indexName || null,
          createdAt,
          createdAt
        );
      }
      for (const source of base.sources || []) {
        const kind = KIND_MAP[source.kind] || "web";
        insertSource.run(
          source.id,
          base.id,
          kind,
          source.name,
          source.status === "Connected" ? "notConfigured" : STATUS_MAP[source.status] || "notConfigured",
          source.indexName || null,
          createdAt,
          createdAt
        );
      }

      for (const doc of base.documents || []) {
        const docId = doc.id;
        insertDoc.run(
          docId,
          base.id,
          sourceId,
          doc.name || docId,
          doc.name || "Untitled",
          doc.type || "text/plain",
          doc.size || 0,
          `${docId}:${(doc.chunks || []).length}`,
          doc.addedAt || createdAt,
          doc.addedAt || createdAt
        );
        (doc.chunks || []).forEach((text, index) => {
          const chunkId = `${docId}_c${index}`;
          insertChunk.run(
            chunkId,
            docId,
            base.id,
            sourceId,
            index,
            text,
            Math.max(1, Math.round(text.length / 4)),
            `${docId}:${index}:${text.length}`
          );
          insertFts.run(text, null, chunkId);
          const vec = doc.embeddings?.[index];
          if (vec && vec.length) {
            const normalised = normalizeVector(vec);
            insertVector.run(
              chunkId,
              base.embeddingModel || "unknown",
              normalised.length,
              vectorToBlob(normalised)
            );
          }
        });
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  try {
    await fs.access(LEGACY_BACKUP);
  } catch {
    await fs.rename(LEGACY_FILE, LEGACY_BACKUP).catch(() => undefined);
  }
}
