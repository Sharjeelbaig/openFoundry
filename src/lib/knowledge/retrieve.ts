// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { completeChat } from "../chat";
import { getDeployments } from "../store";
import type { ProviderId } from "../types";
import { getKnowledgeDb } from "./db";
import { embedQuery, EmbeddingModelMismatchError } from "./embedding";
import { blobToVector, dot } from "./vector";
import { resolveSourceConfig } from "../connections/resolve";
import {
  isRemoteQueryable,
  searchAzureIndex,
  searchMcpSource,
  type RemoteHit,
} from "./remote";
import {
  getBaseRecord,
  listDocumentsWithChunks,
  listSourceRecords,
} from "./service";
import type {
  ActivityEntry,
  Citation,
  OutputMode,
  ReasoningEffort,
  RetrieveRequest,
  RetrieveResult,
  SourceRecord,
} from "./types";
import { newId, nowIso } from "../store";

const RRF_K = 60;
const L1_DEPTH = 50;
const RERANK_THRESHOLD = 2.5;
const RERANKER_INPUT = 50;

/** Activity types that are model steps rather than knowledge source queries. */
const MODEL_ACTIVITY_TYPES = new Set<string>([
  "modelQueryPlanning",
  "modelAnswerSynthesis",
  "modelWebSummarization",
  "agenticReasoning",
  "heuristicQueryPlanning",
]);

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "were", "be", "been", "do", "does", "did", "how", "what",
  "when", "where", "which", "who", "why", "that", "this", "these", "those",
  "i", "you", "we", "they", "it", "as", "at", "by", "from", "me", "my", "your",
]);

interface ChatTarget {
  model: string;
  provider: ProviderId;
}

function timestamp(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Foundry names an activity record after the knowledge source kind. Its REST
 * values are camel-case (`searchIndex`, `azureBlob`, `sharePoint`), while our
 * storage uses hyphenated kinds.
 */
export function activityTypeFor(source: SourceRecord): ActivityEntry["type"] {
  switch (source.kind) {
    case "azure-ai-search":
      return "searchIndex";
    case "azure-blob":
      return "azureBlob";
    case "google-drive":
      return "googleDrive";
    case "sharepoint-indexed":
    case "sharepoint-remote":
      return "sharePoint";
    case "fabric-data-agent":
      return "fabricDataAgent";
    case "fabric-ontology":
      return "fabricOntology";
    case "work-iq":
      return "workIQ";
    case "onelake":
      return "oneLake";
    case "mcp":
      return "mcpServer";
    case "http":
      return "mcp";
    default:
      return source.kind;
  }
}

/**
 * Source activity carries the arguments actually sent to the source. Foundry's
 * shape differs per source type; the file and search-index shapes below are
 * the ones captured from a live knowledge base.
 */
function sourceArguments(
  type: string,
  search: string,
  source?: SourceRecord
): Record<string, unknown> {
  if (type === "searchIndex") {
    return {
      searchIndexArguments: {
        search,
        filter: null,
        sourceDataFields: [],
        searchFields: [],
        semanticConfigurationName:
          String(source?.config.semanticConfiguration || "").trim() || null,
      },
    };
  }
  if (type === "file") return { fileArguments: { search } };
  if (type === "web") return { webArguments: { search } };
  if (type === "mcpServer") {
    const argumentName =
      String(source?.config.queryArgument || "query").trim() || "query";
    const toolArguments =
      String(source?.config.queryFormat || "string") === "query_variants"
        ? { [argumentName]: [search] }
        : { [argumentName]: search };
    return {
      mcpServerArguments: {
        toolName: String(source?.config.tool || ""),
        toolArguments,
      },
    };
  }
  return { [`${type}Arguments`]: { search } };
}

async function resolveChat(modelName: string | null | undefined): Promise<ChatTarget | null> {
  if (!modelName) return null;
  const deployments = await getDeployments();
  const deployment = deployments.find(
    (item) =>
      item.name === modelName ||
      item.modelId === modelName ||
      item.modelName === modelName
  );
  if (deployment) {
    return { model: deployment.modelId, provider: deployment.provider };
  }
  const [head, ...tail] = modelName.split(":");
  if (
    tail.length > 0 &&
    ["ollama", "foundry", "lmstudio", "llamacpp"].includes(head)
  ) {
    return { model: tail.join(":"), provider: head as ProviderId };
  }
  return { model: modelName, provider: "ollama" };
}

function queryText(request: RetrieveRequest): string {
  if (request.query?.trim()) return request.query.trim();
  const intent = request.intents?.[0]?.search;
  if (intent?.trim()) return intent.trim();
  const user = [...(request.messages || [])]
    .reverse()
    .find((message) => message.role === "user");
  return user?.content?.trim() || "";
}

function keywords(text: string): string[] {
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
  return tokens.filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/** Deterministic planner used when no chat model is configured. */
function heuristicPlan(query: string, effort: ReasoningEffort, instructions: string): string[] {
  if (effort === "minimal") return [query];
  const words = keywords(query);
  const plans = [query];
  if (words.length >= 2) plans.push(words.join(" "));
  if (effort === "medium") {
    const clauses = query
      .split(/\?|,|;|\band\b|\bor\b|\bthen\b/gi)
      .map((clause) => keywords(clause).join(" "))
      .filter((clause) => clause.split(/\s+/).filter(Boolean).length >= 2);
    plans.push(...clauses);
  }
  if (instructions.trim()) {
    const guided = keywords(instructions).slice(0, 6).join(" ");
    if (guided) plans.push(`${query} ${guided}`);
  }
  const cap = effort === "low" ? 3 : 5;
  return [...new Set(plans.map((plan) => plan.trim()).filter(Boolean))].slice(0, cap);
}

async function modelPlan(
  query: string,
  effort: ReasoningEffort,
  instructions: string,
  chat: ChatTarget | null,
  signal?: AbortSignal
): Promise<{ plan: string[]; activity: ActivityEntry | null }> {
  if (effort === "minimal") return { plan: [query], activity: null };
  if (!chat) {
    // Foundry requires a chat model for non-minimal effort. openFoundry keeps
    // the model optional, so it records that the deterministic planner ran
    // instead of pretending a model produced the plan.
    return {
      plan: heuristicPlan(query, effort, instructions),
      activity: {
        type: "heuristicQueryPlanning",
        id: 0,
        note: "No chat model is configured on this knowledge base; a deterministic planner produced the subqueries.",
      },
    };
  }
  const cap = effort === "low" ? 3 : 5;
  const started = Date.now();
  const startedAt = timestamp(started);
  try {
    const result = await completeChat({
      model: chat.model,
      provider: chat.provider,
      temperature: 0,
      maxTokens: 220,
      signal,
      messages: [
        {
          role: "system",
          content:
            `You rewrite a search question into at most ${cap} focused subqueries for retrieval. ` +
            "Return only a JSON array of strings. Keep names, product codes and numbers verbatim. " +
            (instructions ? `Retrieval instructions: ${instructions}` : ""),
        },
        { role: "user", content: query },
      ],
    });
    const match = /\[[\s\S]*\]/.exec(result.text);
    const parsed = match ? (JSON.parse(match[0]) as unknown) : null;
    const plan = Array.isArray(parsed)
      ? [...new Set(parsed.map((item) => String(item).trim()).filter(Boolean))].slice(0, cap)
      : [];
    if (plan.length === 0) throw new Error("Planner returned no subqueries.");
    return {
      plan: [query, ...plan.filter((item) => item !== query)].slice(0, cap),
      activity: {
        type: "modelQueryPlanning",
        id: 0,
        startedAt,
        completedAt: timestamp(Date.now()),
        inputTokens: result.promptTokens,
        outputTokens: result.completionTokens,
        elapsedMs: Date.now() - started,
        model: { modelName: chat.model, deploymentId: chat.model },
      },
    };
  } catch {
    return {
      plan: heuristicPlan(query, effort, instructions),
      activity: {
        type: "heuristicQueryPlanning",
        id: 0,
        startedAt,
        completedAt: timestamp(Date.now()),
        elapsedMs: Date.now() - started,
        note: "The configured chat model did not return a usable plan; a deterministic planner ran instead.",
      },
    };
  }
}

function ftsQuery(text: string): string {
  const tokens = [...new Set(keywords(text))].slice(0, 14);
  if (tokens.length === 0) return "";
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" OR ");
}

interface Ranked {
  chunkId: string;
  score: number;
}

export function rrf(lists: Ranked[][]): Ranked[] {
  const merged = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, index) => {
      merged.set(item.chunkId, (merged.get(item.chunkId) || 0) + 1 / (RRF_K + index + 1));
    });
  }
  return [...merged.entries()]
    .map(([chunkId, score]) => ({ chunkId, score }))
    .sort((a, b) => b.score - a.score);
}

function ftsSearch(
  db: DatabaseSync,
  baseId: string,
  sourceIds: string[] | null,
  text: string
): Ranked[] {
  const match = ftsQuery(text);
  if (!match) return [];
  const filter = sourceIds?.length
    ? ` AND c.source_id IN (${sourceIds.map(() => "?").join(",")})`
    : "";
  try {
    const rows = db
      .prepare(
        `SELECT f.chunk_id AS chunk_id, bm25(chunks_fts) AS score
         FROM chunks_fts f
         JOIN chunks c ON c.id = f.chunk_id
         WHERE chunks_fts MATCH ? AND c.base_id = ?${filter}
         ORDER BY score ASC
         LIMIT ?`
      )
      .all(match, baseId, ...(sourceIds?.length ? sourceIds : []), L1_DEPTH) as {
      chunk_id: string;
      score: number;
    }[];
    return rows.map((row) => ({ chunkId: row.chunk_id, score: Number(row.score) }));
  } catch {
    return [];
  }
}

function vectorSearch(
  db: DatabaseSync,
  baseId: string,
  sourceIds: string[] | null,
  vector: Float32Array
): Ranked[] {
  const filter = sourceIds?.length
    ? ` AND c.source_id IN (${sourceIds.map(() => "?").join(",")})`
    : "";
  const rows = db
    .prepare(
      `SELECT v.chunk_id AS chunk_id, v.vec AS vec
       FROM vectors v JOIN chunks c ON c.id = v.chunk_id
       WHERE c.base_id = ?${filter}`
    )
    .all(baseId, ...(sourceIds?.length ? sourceIds : [])) as {
    chunk_id: string;
    vec: Uint8Array;
  }[];
  return rows
    .map((row) => {
      const stored = blobToVector(row.vec);
      if (stored.length !== vector.length) {
        throw new EmbeddingModelMismatchError(
          `Stored vector dimension ${stored.length} does not match the query dimension ${vector.length}. Re-sync this base with the current embedding model.`
        );
      }
      return { chunkId: String(row.chunk_id), score: dot(vector, stored) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, L1_DEPTH);
}

interface Candidate {
  chunkId: string;
  score: number;
  rerankerScore: number | null;
}

async function rerank(
  candidates: Candidate[],
  query: string,
  chat: ChatTarget | null,
  chunkText: (id: string) => string,
  signal?: AbortSignal
): Promise<{ candidates: Candidate[]; outputTokens: number; note: string | null }> {
  if (!chat || candidates.length === 0) {
    return { candidates, outputTokens: 0, note: null };
  }
  const started = Date.now();
  const input = candidates.slice(0, RERANKER_INPUT).map((candidate, index) => ({
    id: index,
    text: chunkText(candidate.chunkId).slice(0, 900),
  }));
  try {
    const result = await completeChat({
      model: chat.model,
      provider: chat.provider,
      temperature: 0,
      maxTokens: 700,
      signal,
      messages: [
        {
          role: "system",
          content:
            "You are a search reranker. Score how well each passage answers the question on a 0-4 scale: " +
            "4 = answers it completely, 3 = relevant but incomplete, 2 = partially relevant, " +
            "1 = barely related, 0 = irrelevant. Return only a JSON array of {\"id\":number,\"score\":number}.",
        },
        {
          role: "user",
          content: `Question: ${query}\n\nPassages:\n${JSON.stringify(input)}`,
        },
      ],
    });
    const match = /\[[\s\S]*\]/.exec(result.text);
    const parsed = match ? (JSON.parse(match[0]) as { id: number; score: number }[]) : null;
    if (!Array.isArray(parsed)) throw new Error("Reranker returned no scores.");
    const scores = new Map<number, number>();
    for (const item of parsed) {
      const id = Number(item.id);
      const score = Number(item.score);
      if (Number.isInteger(id) && Number.isFinite(score)) {
        scores.set(id, Math.max(0, Math.min(4, score)));
      }
    }
    const scored = candidates.map((candidate, index) => ({
      ...candidate,
      rerankerScore: scores.get(index) ?? 0,
    }));
    scored.sort(
      (a, b) =>
        (b.rerankerScore ?? 0) - (a.rerankerScore ?? 0) || b.score - a.score
    );
    // Foundry emits no reranker activity record; reranker output tokens are
    // folded into agenticReasoning.reasoningTokens.
    void started;
    return { candidates: scored, outputTokens: result.completionTokens, note: null };
  } catch (error) {
    return {
      candidates,
      outputTokens: 0,
      note: `Reranker unavailable, so fusion order was kept: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

const L3_MAX_QUERIES = 3;
const L3_COVERAGE_INPUT = 6;

interface Coverage {
  sufficient: boolean;
  missing: string;
  queries: string[];
}

/**
 * Medium-effort coverage assessment. Foundry represents the second planning
 * pass as a second `modelQueryPlanning` record; it has no dedicated iteration
 * activity type. Without a chat model there is no judgement to make, so the
 * caller records that the pass was skipped instead of inventing a verdict.
 */
async function assessCoverage(
  query: string,
  passages: { title: string; section: string | null; text: string; score: number | null }[],
  chat: ChatTarget | null,
  signal?: AbortSignal
): Promise<{ coverage: Coverage | null; activity: ActivityEntry | null; skipNote: string | null }> {
  if (!chat) {
    return {
      coverage: null,
      activity: null,
      skipNote:
        "Medium effort requests a second planning pass, but this base has no chat model. The iterative pass was skipped rather than simulated.",
    };
  }
  const started = Date.now();
  const startedAt = timestamp(started);
  try {
    const result = await completeChat({
      model: chat.model,
      provider: chat.provider,
      temperature: 0,
      maxTokens: 320,
      signal,
      messages: [
        {
          role: "system",
          content:
            "You judge whether retrieved passages already answer a question. " +
            'Return only JSON: {"sufficient":boolean,"missing":"the fact still missing","queries":["up to 2 new search queries"]}. ' +
            "Set sufficient true when the passages contain the answer, when the question is out of scope, " +
            "or when more searching cannot help. When insufficient, each query must target the missing fact " +
            "and must not repeat the original question.",
        },
        {
          role: "user",
          content: `Question: ${query}\n\nPassages:\n${JSON.stringify(passages)}`,
        },
      ],
    });
    const match = /\{[\s\S]*\}/.exec(result.text);
    const parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : null;
    if (!parsed || typeof parsed.sufficient !== "boolean") {
      throw new Error("The coverage assessment returned no verdict.");
    }
    const missing = typeof parsed.missing === "string" ? parsed.missing.trim() : "";
    const queries = Array.isArray(parsed.queries)
      ? [
          ...new Set(
            parsed.queries
              .map((item) => String(item).trim())
              .filter(Boolean)
              .filter((item) => item.toLowerCase() !== query.toLowerCase())
          ),
        ].slice(0, L3_MAX_QUERIES)
      : [];
    return {
      coverage: {
        sufficient: parsed.sufficient,
        missing,
        queries: parsed.sufficient ? [] : queries,
      },
      activity: {
        type: "modelQueryPlanning",
        id: 0,
        startedAt,
        completedAt: timestamp(Date.now()),
        inputTokens: result.promptTokens,
        outputTokens: result.completionTokens,
        elapsedMs: Date.now() - started,
        model: { modelName: chat.model, deploymentId: chat.model },
      },
      skipNote: null,
    };
  } catch (error) {
    return {
      coverage: null,
      activity: {
        type: "heuristicQueryPlanning",
        id: 0,
        startedAt,
        completedAt: timestamp(Date.now()),
        elapsedMs: Date.now() - started,
        note: `Coverage assessment failed, so no second pass ran: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      skipNote: null,
    };
  }
}

export async function retrieve(
  baseId: string,
  request: RetrieveRequest
): Promise<RetrieveResult> {
  const started = Date.now();
  const db = await getKnowledgeDb();
  const base = await getBaseRecord(baseId);
  if (!base) throw new Error("Knowledge base not found.");

  const query = queryText(request);
  if (!query) throw new Error("A query, intent or user message is required.");

  const effort: ReasoningEffort =
    request.retrievalReasoningEffort?.kind || base.reasoningEffort || "low";
  const resolvedEffort: ReasoningEffort = effort === "auto" ? "low" : effort;
  const outputMode: OutputMode = request.outputMode || base.outputMode || "extractiveData";
  const topK = Math.min(Math.max(request.maxOutputDocuments ?? 10, 1), 50);
  const maxRuntimeSeconds = Math.min(
    Math.max(Math.floor(request.maxRuntimeInSeconds ?? 180), 1),
    600
  );
  const controller = new AbortController();
  const budget = setTimeout(() => controller.abort(), maxRuntimeSeconds * 1000);
  budget.unref?.();

  const sources = await listSourceRecords(baseId);
  const sourceParams = request.knowledgeSourceParams || [];
  const wanted = sourceParams
    .map((entry) => entry.sourceId || entry.knowledgeSourceName)
    .filter(Boolean) as string[];
  const scoped = wanted.length
    ? sources.filter(
        (source) => wanted.includes(source.id) || wanted.includes(source.name)
      )
    : sources;
  const indexedSources = scoped.filter((source) => source.mode === "indexed");
  const remoteSources = scoped.filter(isRemoteQueryable);

  const chat = await resolveChat(base.chatModel);
  const activity: ActivityEntry[] = [];
  let reasoningTokens = 0;
  const notes: string[] = [];
  let nextActivityId = 0;
  const pushActivity = (entry: Omit<ActivityEntry, "id">): ActivityEntry => {
    const stored = { ...entry, id: nextActivityId++ } as ActivityEntry;
    activity.push(stored);
    return stored;
  };

  // L1 planning. The MCP tool sends query_variants that are already planned,
  // so it supplies them directly instead of paying for a second planning pass.
  const supplied = (request.subqueries || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
  const planning =
    supplied.length > 0
      ? { plan: supplied, activity: null }
      : await modelPlan(
          query,
          resolvedEffort,
          base.retrievalInstructions,
          chat,
          controller.signal
        );
  const plan = planning.plan.length ? planning.plan : [query];
  if (planning.activity) {
    pushActivity(planning.activity);
    reasoningTokens += Number(planning.activity.outputTokens || 0);
  }

  // Each subquery is embedded separately: reusing the original query's vector
  // would make every subquery return the same vector list and quietly turn
  // fusion into lexical-only ranking.
  const embeddingModel = base.embeddingModel || null;
  let embeddingNote: string | null = null;
  const vectorCache = new Map<string, Float32Array | null>();
  const vectorFor = async (text: string): Promise<Float32Array | null> => {
    if (vectorCache.has(text)) return vectorCache.get(text) ?? null;
    try {
      const embedded = await embedQuery(text, base.embeddingModel);
      if (!embedded && base.embeddingModel) {
        embeddingNote =
          "No embedding provider is reachable; retrieval used BM25 only.";
      }
      vectorCache.set(text, embedded?.vector || null);
      return embedded?.vector || null;
    } catch (error) {
      if (error instanceof EmbeddingModelMismatchError) throw error;
      embeddingNote = error instanceof Error ? error.message : String(error);
      vectorCache.set(text, null);
      return null;
    }
  };

  // Foundry records one source-kind activity per knowledge source and
  // subquery. Chunks remember the first activity that produced them so every
  // reference can cross-link to a real activity id.
  const chunkActivity = new Map<string, number>();
  const localPass = async (queries: string[]): Promise<Ranked[][]> => {
    const lists: Ranked[][] = [];
    for (const subquery of queries) {
      const vector = await vectorFor(subquery);
      const perQuery: Ranked[][] = [];
      for (const source of indexedSources) {
        const retrievalStarted = Date.now();
        const lexical = ftsSearch(db, baseId, [source.id], subquery);
        const vectorList = vector
          ? vectorSearch(db, baseId, [source.id], vector)
          : [];
        const perSource = rrf([lexical, vectorList]);
        const type = activityTypeFor(source);
        const now = Date.now();
        const entry = pushActivity({
          type,
          startedAt: timestamp(retrievalStarted),
          completedAt: timestamp(now),
          knowledgeSourceName: source.name,
          queryTime: timestamp(now),
          count: perSource.length,
          elapsedMs: now - retrievalStarted,
          ...sourceArguments(type, subquery, source),
        });
        for (const item of perSource) {
          if (!chunkActivity.has(item.chunkId)) {
            chunkActivity.set(item.chunkId, entry.id);
          }
        }
        perQuery.push(perSource);
      }
      lists.push(rrf(perQuery));
    }
    return lists;
  };

  const firstLists = await localPass(plan);
  let fused = rrf(firstLists);

  // Chunk metadata lookup
  const docs = await listDocumentsWithChunks(baseId);
  const chunkMap = new Map<
    string,
    { doc: (typeof docs)[number]; chunk: (typeof docs)[number]["chunks"][number] }
  >();
  for (const doc of docs) {
    for (const chunk of doc.chunks) chunkMap.set(chunk.id, { doc, chunk });
  }
  const sourceMap = new Map(sources.map((source) => [source.id, source]));

  // Remote sources are queried live and never ingested. A failure is reported
  // in the activity log and does not discard results from other sources.
  const remoteMap = new Map<string, { hit: RemoteHit; source: SourceRecord }>();
  const remoteCandidates: Candidate[] = [];
  const remotePass = async (queries: string[]) => {
    for (const source of remoteSources) {
      const type = activityTypeFor(source);
      for (const subquery of queries) {
        const retrievalStarted = Date.now();
        try {
          const config = await resolveSourceConfig(source);
          const hits =
            source.kind === "mcp"
              ? await searchMcpSource(config, subquery, controller.signal)
              : await searchAzureIndex(
                  config,
                  subquery,
                  L1_DEPTH,
                  controller.signal
                );
          let fresh = 0;
          hits.forEach((hit, position) => {
            const id = `remote:${source.id}:${hit.id}`;
            if (remoteMap.has(id)) return;
            fresh += 1;
            remoteMap.set(id, { hit, source });
            remoteCandidates.push({
              chunkId: id,
              // Rank-based, comparable in magnitude to the local RRF scores.
              score: 1 / (RRF_K + position + 1),
              rerankerScore: hit.rerankerScore ?? null,
            });
          });
          const now = Date.now();
          const entry = pushActivity({
            type,
            startedAt: timestamp(retrievalStarted),
            completedAt: timestamp(now),
            knowledgeSourceName: source.name,
            queryTime: timestamp(now),
            count: fresh,
            elapsedMs: now - retrievalStarted,
            ...sourceArguments(type, subquery, source),
          });
          for (const hit of hits) {
            const id = `remote:${source.id}:${hit.id}`;
            if (!chunkActivity.has(id)) chunkActivity.set(id, entry.id);
          }
        } catch (error) {
          const now = Date.now();
          pushActivity({
            type,
            startedAt: timestamp(retrievalStarted),
            completedAt: timestamp(now),
            knowledgeSourceName: source.name,
            queryTime: timestamp(now),
            count: 0,
            elapsedMs: now - retrievalStarted,
            warning: error instanceof Error ? error.message : String(error),
            ...sourceArguments(type, subquery, source),
          });
        }
      }
    }
  };
  await remotePass(plan);

  const candidatesFor = (ranked: Ranked[]): Candidate[] => [
    ...ranked
      .filter((item) => chunkMap.has(item.chunkId))
      .map((item) => ({ chunkId: item.chunkId, score: item.score, rerankerScore: null })),
    ...remoteCandidates,
  ];

  // L2 reranking, over local chunks and remote passages together. Foundry has
  // no reranker activity record: its output tokens are folded into the final
  // agenticReasoning.reasoningTokens figure.
  const firstRerank = await rerank(
    candidatesFor(fused),
    query,
    chat,
    (id) => chunkMap.get(id)?.chunk.text || remoteMap.get(id)?.hit.excerpt || "",
    controller.signal
  );
  reasoningTokens += firstRerank.outputTokens;
  if (firstRerank.note) notes.push(firstRerank.note);
  let candidates = firstRerank.candidates;

  // Iterative retrieval. Foundry performs it only at medium effort and reports
  // the second planning call as another modelQueryPlanning record.
  if (controller.signal.aborted) {
    notes.push(
      `Retrieval reached its ${maxRuntimeSeconds}-second budget before the iterative pass; first-pass results are returned as partial.`
    );
  } else if (resolvedEffort === "medium") {
    const coverage = await assessCoverage(
      query,
      candidates.slice(0, L3_COVERAGE_INPUT).map((candidate) => {
        const local = chunkMap.get(candidate.chunkId);
        const remote = remoteMap.get(candidate.chunkId);
        return {
          title: local?.doc.title || remote?.hit.title || "Untitled",
          section: local?.chunk.section ?? null,
          text: (local?.chunk.text || remote?.hit.excerpt || "").slice(0, 700),
          score: candidate.rerankerScore,
        };
      }),
      chat,
      controller.signal
    );
    if (coverage.activity) {
      pushActivity(coverage.activity);
      reasoningTokens += Number(coverage.activity.outputTokens || 0);
    }
    if (coverage.skipNote) notes.push(coverage.skipNote);
    const refined = coverage.coverage?.queries ?? [];
    if (coverage.coverage && !coverage.coverage.sufficient && refined.length > 0) {
      const secondLists = await localPass(refined);
      fused = rrf([...firstLists, ...secondLists]);
      await remotePass(refined);
      const secondRerank = await rerank(
        candidatesFor(fused),
        query,
        chat,
        (id) => chunkMap.get(id)?.chunk.text || remoteMap.get(id)?.hit.excerpt || "",
        controller.signal
      );
      reasoningTokens += secondRerank.outputTokens;
      if (secondRerank.note) notes.push(secondRerank.note);
      candidates = secondRerank.candidates;
    } else if (coverage.coverage && !coverage.coverage.sufficient) {
      notes.push(
        "The coverage assessment asked for another pass but returned no usable queries; the first-pass results stand."
      );
    }
  }

  const rerankerRan =
    candidates.length > 0 && candidates.some((item) => item.rerankerScore != null);
  let selected = rerankerRan
    ? candidates.filter((item) => (item.rerankerScore ?? 0) >= RERANK_THRESHOLD)
    : candidates;
  let belowThreshold = false;
  if (rerankerRan && selected.length === 0) {
    belowThreshold = true;
    selected = candidates.slice(0, Math.min(3, topK));
    notes.push(
      `No passage scored ${RERANK_THRESHOLD} or higher; the best ${selected.length} were returned with their scores.`
    );
    for (const entry of activity) {
      if (!MODEL_ACTIVITY_TYPES.has(entry.type)) {
        entry.count = 0;
        entry.warning =
          "All retrieved documents were filtered because they did not meet the reranker score threshold.";
      }
    }
  }
  selected = selected.slice(0, topK);

  type CitationBase = Omit<Citation, "refId"> & {
    activityType: string;
    citationUrl: string | null;
  };
  const citationBases = selected.flatMap<CitationBase>((candidate) => {
    const remote = remoteMap.get(candidate.chunkId);
    if (remote) {
      return [
        {
          chunkId: candidate.chunkId,
          documentId: remote.hit.id,
          sourceId: remote.source.id,
          sourceName: remote.source.name,
          sourceKind: remote.source.kind,
          title: remote.hit.title,
          uri: remote.hit.uri ?? null,
          page: null,
          section: null,
          charStart: null,
          charEnd: null,
          excerpt: remote.hit.excerpt,
          score: candidate.score,
          rerankerScore: candidate.rerankerScore,
          activityType: activityTypeFor(remote.source),
          citationUrl: null,
        } satisfies CitationBase,
      ];
    }
    const found = chunkMap.get(candidate.chunkId);
    if (!found) return [];
    const source = sourceMap.get(found.chunk.sourceId);
    return [
      {
        chunkId: candidate.chunkId,
        documentId: found.doc.id,
        sourceId: found.chunk.sourceId,
        sourceName: source?.name || "Source",
        sourceKind: (source?.kind || "file") as Citation["sourceKind"],
        title: found.doc.title,
        uri: found.doc.uri ?? null,
        page: found.chunk.page ?? null,
        section: found.chunk.section ?? null,
        charStart: found.chunk.charStart ?? null,
        charEnd: found.chunk.charEnd ?? null,
        excerpt: found.chunk.text,
        score: candidate.score,
        rerankerScore: candidate.rerankerScore,
        activityType: source ? activityTypeFor(source) : "file",
        citationUrl: `/api/knowledge/${encodeURIComponent(
          baseId
        )}/documents/${encodeURIComponent(found.doc.id)}`,
      } satisfies CitationBase,
    ];
  });
  const citations: Citation[] = citationBases.map((citation, index) => ({
    ...citation,
    refId: String(index),
  }));

  // Response construction. Extractive mode returns the same JSON array of
  // {ref_id, content} that Foundry returns; answer mode returns the answer text
  // with [ref_id:n] markers.
  let answer: string | null = null;
  if (outputMode === "answerSynthesis") {
    if (!chat) {
      throw new Error(
        "Answer synthesis needs a chat completions model on this knowledge base. Select one, or switch Output mode to Extractive data."
      );
    }
    const context = citations
      .map(
        (citation) =>
          `[ref_id:${citation.refId}] ${citation.title}${
            citation.section ? ` — ${citation.section}` : ""
          }\n${citation.excerpt}`
      )
      .join("\n\n");
    if (controller.signal.aborted) {
      notes.push(
        `Retrieval reached its ${maxRuntimeSeconds}-second budget before answer synthesis; the response is partial.`
      );
    } else {
      const answerStarted = Date.now();
      try {
        const result = await completeChat({
          model: chat.model,
          provider: chat.provider,
          temperature: 0,
          signal: controller.signal,
          messages: [
            {
              role: "system",
              content:
                "Answer only from the supplied passages. Cite every claim with [ref_id:n], where n is the passage's ref_id. If the passages do not contain the answer, say you do not know. " +
                (base.answerInstructions || ""),
            },
            { role: "user", content: `Question: ${query}\n\nPassages:\n${context}` },
          ],
        });
        answer = result.text.trim();
        pushActivity({
          type: "modelAnswerSynthesis",
          startedAt: timestamp(answerStarted),
          completedAt: timestamp(Date.now()),
          inputTokens: result.promptTokens,
          outputTokens: result.completionTokens,
          elapsedMs: Date.now() - answerStarted,
          model: { modelName: chat.model, deploymentId: chat.model },
        });
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        notes.push(
          `Answer synthesis stopped at the ${maxRuntimeSeconds}-second budget; the response is partial.`
        );
      }
    }
  }

  if (embeddingNote) notes.push(embeddingNote);

  const responseText =
    answer ??
    JSON.stringify(
      citations.map((citation) => ({
        ref_id: Number(citation.refId),
        content: citation.excerpt,
      }))
    );

  const reasoningStarted = Date.now();
  pushActivity({
    type: "agenticReasoning",
    startedAt: timestamp(reasoningStarted),
    completedAt: timestamp(reasoningStarted),
    reasoningTokens,
    retrievalReasoningEffort: { kind: resolvedEffort },
    logicalReasoningEffort: { kind: resolvedEffort },
    ...(notes.length ? { note: notes.join(" ") } : {}),
  });

  const firstSourceActivityId =
    activity.find((entry) => !MODEL_ACTIVITY_TYPES.has(entry.type))?.id ?? 0;

  const references = citationBases.map((citation, index) => {
    const isIndex = citation.activityType === "searchIndex";
    const isMcp = citation.activityType === "mcpServer";
    const activitySource =
      chunkActivity.get(citation.chunkId) ?? firstSourceActivityId;
    const sourceEntry = activity.find((entry) => entry.id === activitySource);
    return {
      type: citation.activityType,
      id: String(index),
      activitySource,
      ...(isIndex
        ? { docKey: citation.documentId }
        : isMcp
        ? {
            title: citation.title,
            toolName: sourceEntry?.mcpServerArguments?.toolName,
          }
        : { docName: citation.title }),
      rerankerScore: citation.rerankerScore ?? null,
      citationUrl: citation.citationUrl,
      sourceData: null,
    };
  });

  const partial = belowThreshold || controller.signal.aborted;
  clearTimeout(budget);
  const latencyMs = Date.now() - started;
  const runId = newId("run");
  if (!request.skipRunLog) {
    db.prepare(
      `INSERT INTO retrieval_runs (id, base_id, query, effort, output_mode, plan_json,
         answer, status, latency_ms, activity_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      runId,
      baseId,
      query,
      resolvedEffort,
      outputMode,
      JSON.stringify(plan),
      answer,
      partial ? "partial" : "succeeded",
      latencyMs,
      JSON.stringify(activity),
      nowIso()
    );
    const insertRef = db.prepare(
      "INSERT OR REPLACE INTO retrieval_run_refs (run_id, ref_id, chunk_id, score, reranker_score) VALUES (?, ?, ?, ?, ?)"
    );
    for (const citation of citations) {
      insertRef.run(
        runId,
        citation.refId,
        citation.chunkId,
        citation.score,
        citation.rerankerScore ?? null
      );
    }
  }

  return {
    response: [{ content: [{ type: "text", text: responseText }] }],
    activity,
    references,
    citations,
    meta: {
      embeddingModel,
      reranker: rerankerRan ? "model" : "none",
      effort: resolvedEffort,
      outputMode,
      plan,
      latencyMs,
      partial,
      runId,
    },
  };
}
