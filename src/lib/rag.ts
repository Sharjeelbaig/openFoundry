import "server-only";
import {
  Citation,
  KnowledgeBase,
  OutputMode,
  ReasoningEffort,
} from "./types";
import { cosine, embedTexts, lexicalScore } from "./providers";
import { getKnowledgeBases, saveKnowledgeBases } from "./store";

export function chunkText(text: string, size = 900, overlap = 140): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length <= size) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }
    if (current) chunks.push(current.trim());
    if (paragraph.length <= size) {
      current = paragraph;
      continue;
    }
    let start = 0;
    while (start < paragraph.length) {
      const end = Math.min(start + size, paragraph.length);
      chunks.push(paragraph.slice(start, end).trim());
      if (end === paragraph.length) break;
      start = Math.max(end - overlap, start + 1);
    }
    current = "";
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

export async function indexKnowledgeBase(kb: KnowledgeBase): Promise<KnowledgeBase> {
  const chunks = kb.documents.flatMap((doc) => doc.chunks);
  const embedded = await embedTexts(chunks);
  if (embedded) {
    let cursor = 0;
    for (const doc of kb.documents) {
      const count = doc.chunks.length;
      doc.embeddings = embedded.vectors.slice(cursor, cursor + count);
      cursor += count;
    }
    kb.embeddingModel = embedded.model;
    kb.embeddingProvider = embedded.provider;
  } else {
    kb.embeddingModel = "lexical BM25";
    kb.embeddingProvider = "lexical";
  }
  kb.status = "Ready";
  kb.updatedAt = new Date().toISOString();
  return kb;
}

export interface RetrieveOptions {
  topK?: number;
  /** Retrieval reasoning effort: how much local query planning to spend. */
  reasoningEffort?: ReasoningEffort;
  /** Instructions that bias the local query planner / refinement step. */
  retrievalInstructions?: string;
  /** Output mode: extractive chunks or a synthesised answer. */
  outputMode?: OutputMode;
}

/** Words the local query planner drops when it rewrites a query. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "were", "be", "been", "do", "does", "did", "how", "what",
  "when", "where", "which", "who", "why", "that", "this", "these", "those",
  "i", "you", "we", "they", "it", "as", "at", "by", "from", "me", "my", "your",
]);

/**
 * Local query planner. Mirrors Foundry IQ's reasoning-effort semantics:
 *   Minimal → search the raw query, no planning.
 *   Low     → one pass of planning, splitting the question into keywords.
 *   Medium  → split into several focused sub-queries and refine once.
 * Everything is derived here; no cloud query planner is involved.
 */
export function planQueries(
  query: string,
  effort: ReasoningEffort = "Minimal",
  instructions?: string
): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (effort === "Minimal") return [trimmed];

  const tokens = trimmed.toLowerCase().match(/[a-z0-9']+/g) || [];
  const keywords = tokens.filter((token) => !STOPWORDS.has(token) && token.length > 2);
  const plans: string[] = [trimmed];
  if (keywords.length >= 2) plans.push(keywords.join(" "));

  if (effort === "Medium") {
    // Split on conjunctions/questions to create focused sub-queries.
    const clauses = trimmed
      .split(/\?|,\s*|\band\b|\bor\b|\bthen\b/gi)
      .map((clause) => clause.trim())
      .filter((clause) => clause.split(/\s+/).length >= 2);
    for (const clause of clauses) {
      const clauseKeywords = (clause.toLowerCase().match(/[a-z0-9']+/g) || [])
        .filter((token) => !STOPWORDS.has(token) && token.length > 2)
        .join(" ");
      if (clauseKeywords) plans.push(clauseKeywords);
    }
  }

  if (instructions?.trim()) plans.push(`${trimmed} ${instructions.trim()}`);

  return [...new Set(plans.filter(Boolean))].slice(0, effort === "Low" ? 2 : 4);
}

interface Candidate {
  documentId: string;
  documentName: string;
  chunk: string;
  score: number;
}

/**
 * Score every chunk against one query, returning candidates with a score in
 * [0,1]. Uses embeddings when the base is embedded, otherwise lexical BM25.
 */
async function scoreCandidates(
  bases: KnowledgeBase[],
  query: string
): Promise<{ candidates: Candidate[]; embeddingModel: string }> {
  const candidates: Candidate[] = [];
  let embeddingModel = "lexical BM25";
  const byDoc = new Map<string, number[][]>();

  for (const kb of bases) {
    for (const doc of kb.documents) {
      if (doc.embeddings) byDoc.set(doc.id, doc.embeddings);
      doc.chunks.forEach((chunk) => {
        candidates.push({
          documentId: doc.id,
          documentName: doc.name,
          chunk,
          score: 0,
        });
        if (doc.embeddings) embeddingModel = kb.embeddingModel;
      });
    }
  }
  if (candidates.length === 0) return { candidates, embeddingModel };

  const queryEmbedding = await embedTexts([query]);
  if (queryEmbedding) {
    embeddingModel = queryEmbedding.model;
    const lookup = new Map<string, number>();
    for (const kb of bases) {
      for (const doc of kb.documents) {
        doc.chunks.forEach((chunk, index) => {
          lookup.set(`${doc.id}::${chunk}`, index);
        });
      }
    }
    for (const candidate of candidates) {
      const embeddings = byDoc.get(candidate.documentId);
      if (!embeddings) continue;
      const index = lookup.get(`${candidate.documentId}::${candidate.chunk}`);
      if (index == null) continue;
      candidate.score = cosine(queryEmbedding.vectors[0], embeddings[index]);
    }
    if (candidates.every((candidate) => candidate.score <= 0)) {
      for (const candidate of candidates) {
        candidate.score = lexicalScore(query, candidate.chunk);
      }
    }
  } else {
    for (const candidate of candidates) {
      candidate.score = lexicalScore(query, candidate.chunk);
    }
  }
  return { candidates, embeddingModel };
}

export async function retrieveCitations(
  knowledgeBaseIds: string[],
  query: string,
  topKOrOptions: number | RetrieveOptions = 4
): Promise<{ citations: Citation[]; embeddingModel: string; plan: string[] }> {
  if (knowledgeBaseIds.length === 0)
    return { citations: [], embeddingModel: "none", plan: [] };
  const options: RetrieveOptions =
    typeof topKOrOptions === "number" ? { topK: topKOrOptions } : topKOrOptions;
  const topK = options.topK ?? 4;

  const bases = await getKnowledgeBases();
  const selected = bases.filter((kb) => knowledgeBaseIds.includes(kb.id));
  if (selected.length === 0)
    return { citations: [], embeddingModel: "none", plan: [] };

  // Highest configured reasoning effort across the selected bases wins.
  const effort: ReasoningEffort =
    options.reasoningEffort ??
    (selected.some((kb) => kb.reasoningEffort === "Medium")
      ? "Medium"
      : selected.some((kb) => kb.reasoningEffort === "Low")
      ? "Low"
      : "Minimal");

  const plan = planQueries(query, effort, options.retrievalInstructions);
  const merged = new Map<string, Candidate>();
  let embeddingModel = "lexical BM25";

  for (const plannedQuery of plan.length ? plan : [query]) {
    const { candidates, embeddingModel: model } = await scoreCandidates(
      selected,
      plannedQuery
    );
    if (model && model !== "lexical BM25") embeddingModel = model;
    for (const candidate of candidates) {
      const key = `${candidate.documentId}::${candidate.chunk}`;
      const existing = merged.get(key);
      // Keep the best score the chunk earned against any planned query.
      if (!existing || candidate.score > existing.score) merged.set(key, candidate);
    }
  }

  let candidates = [...merged.values()].sort((a, b) => b.score - a.score);

  if (effort === "Medium" && candidates.length > topK) {
    // Refine once: blend each chunk's multi-query score with its relevance to
    // the original question so the final answer stays on-topic.
    for (const candidate of candidates) {
      const direct = lexicalScore(query, candidate.chunk);
      candidate.score = candidate.score * 0.7 + direct * 0.3;
    }
    candidates = candidates.sort((a, b) => b.score - a.score);
  }

  if (candidates.length && candidates[0].score <= 0) {
    for (const candidate of candidates) {
      candidate.score = lexicalScore(query, candidate.chunk);
    }
    candidates = candidates.sort((a, b) => b.score - a.score);
  }

  const citations: Citation[] = candidates
    .filter((candidate) => candidate.score > 0)
    .slice(0, topK)
    .map((candidate) => ({
      documentId: candidate.documentId,
      documentName: candidate.documentName,
      chunk: candidate.chunk,
      score: candidate.score,
    }));

  return { citations, embeddingModel, plan };
}

export async function reindexAll(): Promise<KnowledgeBase[]> {
  const bases = await getKnowledgeBases();
  for (const kb of bases) {
    await indexKnowledgeBase(kb);
  }
  await saveKnowledgeBases(bases);
  return bases;
}
