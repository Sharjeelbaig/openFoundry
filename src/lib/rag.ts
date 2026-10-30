import "server-only";
import { Citation, KnowledgeBase } from "./types";
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

export async function retrieveCitations(
  knowledgeBaseIds: string[],
  query: string,
  topK = 4
): Promise<{ citations: Citation[]; embeddingModel: string }> {
  if (knowledgeBaseIds.length === 0)
    return { citations: [], embeddingModel: "none" };
  const bases = await getKnowledgeBases();
  const selected = bases.filter((kb) => knowledgeBaseIds.includes(kb.id));
  const candidates: Citation[] = [];
  let embeddingModel = "lexical BM25";

  for (const kb of selected) {
    for (const doc of kb.documents) {
      doc.chunks.forEach((chunk, index) => {
        const embedding = doc.embeddings?.[index];
        if (embedding) {
          candidates.push({
            documentId: doc.id,
            documentName: doc.name,
            chunk,
            score: 0,
          });
          embeddingModel = kb.embeddingModel;
        } else {
          candidates.push({
            documentId: doc.id,
            documentName: doc.name,
            chunk,
            score: 0,
          });
        }
      });
    }
  }
  if (candidates.length === 0)
    return { citations: [], embeddingModel };

  const queryEmbedding = await embedTexts([query]);
  if (queryEmbedding) {
    embeddingModel = queryEmbedding.model;
    const byDoc = new Map<string, number[][]>();
    for (const kb of selected) {
      for (const doc of kb.documents) {
        if (doc.embeddings) byDoc.set(doc.id, doc.embeddings);
      }
    }
    for (const candidate of candidates) {
      const embeddings = byDoc.get(candidate.documentId);
      if (!embeddings) continue;
      const index = selected
        .flatMap((kb) => kb.documents)
        .find((doc) => doc.id === candidate.documentId)
        ?.chunks.indexOf(candidate.chunk);
      if (index == null || index < 0) continue;
      candidate.score = cosine(queryEmbedding.vectors[0], embeddings[index]);
    }
  } else {
    for (const candidate of candidates) {
      candidate.score = lexicalScore(query, candidate.chunk);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates.slice(0, topK);
  if (best.length && best[0].score <= 0) {
    for (const candidate of candidates.slice(0, topK)) {
      candidate.score = lexicalScore(query, candidate.chunk);
    }
    candidates.sort((a, b) => b.score - a.score);
  }
  return {
    citations: candidates
      .filter((c) => c.score > 0)
      .slice(0, topK),
    embeddingModel,
  };
}

export async function reindexAll(): Promise<KnowledgeBase[]> {
  const bases = await getKnowledgeBases();
  for (const kb of bases) {
    await indexKnowledgeBase(kb);
  }
  await saveKnowledgeBases(bases);
  return bases;
}
