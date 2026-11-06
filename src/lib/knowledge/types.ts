// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Knowledge (Foundry IQ) domain types.
 *
 * These are the storage/engine types. The legacy JSON shapes in `src/lib/types.ts`
 * stay in place until the UI is migrated, and `service.ts` maps between them.
 */

/** Every source kind the picker can show. */
export type SourceKind =
  // Indexed, local or BYO — real ingestion.
  | "file"
  | "folder"
  | "web"
  | "git"
  | "sqlite"
  | "csv"
  | "s3"
  | "azure-blob"
  | "gcs"
  | "webdav"
  | "google-drive"
  | "sftp"
  // Remote, query time. Never ingested.
  | "azure-ai-search"
  | "mcp"
  | "http"
  | "work-iq"
  | "fabric-data-agent"
  | "fabric-ontology"
  | "sharepoint-remote"
  // Indexed, requires a Microsoft tenant.
  | "sharepoint-indexed"
  | "onelake"
  // Local exports: real ingestion from files the user is allowed to export.
  | "sharepoint-export"
  | "fabric-export";

export type SourceMode = "indexed" | "remote" | "unavailable";

/**
 * A source may only report `ready` after a completed sync (indexed) or a
 * successful query (remote). Nothing else may write `ready`.
 */
export type SourceStatus =
  | "notConfigured"
  | "indexing"
  | "ready"
  | "readyWithErrors"
  | "failed"
  | "cancelled"
  | "remote"
  | "unavailable";

export type BaseStatus = "ready" | "indexing" | "readyWithErrors" | "failed";

export type ReasoningEffort = "minimal" | "low" | "medium" | "auto";
export type OutputMode = "extractiveData" | "answerSynthesis";

export interface KnowledgeBaseRecord {
  id: string;
  name: string;
  description: string;
  connectionId?: string | null;
  chatModel?: string | null;
  reasoningEffort: ReasoningEffort;
  outputMode: OutputMode;
  retrievalInstructions: string;
  answerInstructions: string;
  encryption?: { enabled: boolean; keyVault?: string; keyName?: string } | null;
  indexName: string;
  embeddingModel?: string | null;
  embeddingProvider?: string | null;
  embeddingDim?: number | null;
  status: BaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SourceRecord {
  id: string;
  baseId: string;
  /** Reusable credential record this source authenticates through. */
  connectionId?: string | null;
  kind: SourceKind;
  mode: SourceMode;
  name: string;
  description: string;
  status: SourceStatus;
  config: Record<string, unknown>;
  indexName?: string | null;
  alwaysQuery: boolean;
  resultsProcessing: "rerank" | "none";
  lastSyncedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  baseId: string;
  sourceId: string;
  externalId: string;
  title: string;
  mime: string;
  uri?: string | null;
  size: number;
  contentHash: string;
  metadata: Record<string, unknown>;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  baseId: string;
  sourceId: string;
  ordinal: number;
  text: string;
  heading?: string | null;
  page?: number | null;
  section?: string | null;
  charStart?: number | null;
  charEnd?: number | null;
  tokenCount: number;
  chunkHash: string;
}

export interface DocumentWithChunks extends DocumentRecord {
  chunks: ChunkRecord[];
}

export interface JobRecord {
  id: string;
  baseId: string;
  sourceId?: string | null;
  kind: "sync" | "reindex" | "delete";
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
  stage?: string | null;
  totalItems: number;
  doneItems: number;
  attempts: number;
  cancelRequested: boolean;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface JobEvent {
  id: number;
  jobId: string;
  at: string;
  level: "info" | "warn" | "error";
  stage?: string | null;
  message: string;
  data?: Record<string, unknown> | null;
}

/** One retrieved chunk, with everything a citation needs. */
export interface Citation {
  refId: string;
  chunkId: string;
  documentId: string;
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind;
  title: string;
  uri?: string | null;
  page?: number | null;
  section?: string | null;
  charStart?: number | null;
  charEnd?: number | null;
  excerpt: string;
  /** Fused (RRF) score of the chunk. */
  score: number;
  /** 0-4 reranker score when a reranker ran. */
  rerankerScore?: number | null;
}

/**
 * Activity types mirror the Azure AI Search agentic-retrieval activity array:
 * one entry per model step plus one source-kind entry per knowledge source and
 * subquery. `heuristicQueryPlanning` is openFoundry-only: it records that no
 * chat model was available, so no model planning activity could honestly be
 * reported.
 */
export type ActivityType =
  | "modelQueryPlanning"
  | "modelAnswerSynthesis"
  | "modelWebSummarization"
  | "agenticReasoning"
  | "heuristicQueryPlanning"
  | "searchIndex"
  | "azureBlob"
  | "googleDrive"
  | "sharePoint"
  | "fabricDataAgent"
  | "fabricOntology"
  | "workIQ"
  | "oneLake"
  | "mcpServer"
  | SourceKind;

export interface ActivityEntry {
  type: ActivityType;
  id: number;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  model?: { modelName: string; deploymentId: string };
  knowledgeSourceName?: string;
  queryTime?: string;
  count?: number;
  warning?: string;
  /** Foundry puts the query on a source-specific arguments object. */
  fileArguments?: { search: string };
  searchIndexArguments?: {
    search: string;
    filter?: string | null;
    sourceDataFields?: string[];
    searchFields?: string[];
    semanticConfigurationName?: string | null;
  };
  mcpServerArguments?: {
    toolName: string;
    toolArguments: Record<string, unknown>;
  };
  retrievalReasoningEffort?: { kind: ReasoningEffort };
  logicalReasoningEffort?: { kind: ReasoningEffort };
  /** openFoundry-only explanation for a fallback, failure or skipped step. */
  note?: string;
  [key: string]: unknown;
}

export interface RetrieveRequest {
  messages?: { role: string; content: string }[];
  intents?: { type?: string; search: string }[];
  query?: string;
  /** Pre-planned subqueries, used by the MCP tool which already planned. */
  subqueries?: string[];
  knowledgeSourceParams?: { knowledgeSourceName?: string; sourceId?: string }[];
  outputMode?: OutputMode;
  retrievalReasoningEffort?: { kind: ReasoningEffort };
  includeActivity?: boolean;
  maxOutputDocuments?: number;
  maxOutputSize?: number;
  /** Foundry's retrieval budget in seconds. Defaults to 180. */
  maxRuntimeInSeconds?: number;
  topK?: number;
  /** Internal: do not persist a retrieval run (used by unit tests). */
  skipRunLog?: boolean;
}

export interface RetrieveResult {
  response: {
    content: { type: "text"; text: string }[];
  }[];
  activity: ActivityEntry[];
  references: {
    type: string;
    id: string;
    activitySource: number;
    /** Document key in the backing index (searchIndex references). */
    docKey?: string;
    /** File name for file-style references. */
    docName?: string;
    /** MCP tool result title and the tool that produced it. */
    title?: string;
    toolName?: string;
    rerankerScore?: number | null;
    citationUrl?: string | null;
    sourceData?: Record<string, unknown> | null;
  }[];
  citations: Citation[];
  meta: {
    embeddingModel: string | null;
    reranker: "model" | "none";
    effort: ReasoningEffort;
    outputMode: OutputMode;
    plan: string[];
    latencyMs: number;
    /** True when a threshold, timeout or failed source made the response partial. */
    partial?: boolean;
    runId?: string;
  };
}

/** A source item produced by a connector, before chunking. */
export interface SourceItem {
  externalId: string;
  title: string;
  mime: string;
  uri?: string;
  size: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorContext {
  config: Record<string, unknown>;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, message?: string) => void;
}

export interface Connector {
  kind: SourceKind;
  mode: SourceMode;
  /** Returns a human-readable error, or null when the config is usable. */
  validate(config: Record<string, unknown>): string | null;
  discover(ctx: ConnectorContext): Promise<SourceItem[]>;
}
