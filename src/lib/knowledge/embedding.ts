// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { embedTexts } from "../providers";
import { normalizeVector } from "./vector";

export interface EmbeddingBatch {
  vectors: Float32Array[];
  model: string;
  provider: string;
  dim: number;
}

/** No embedding runtime is available. The index can still work lexically. */
export class EmbeddingUnavailableError extends Error {}

/** The runtime served a different model than the index was built with. */
export class EmbeddingModelMismatchError extends Error {}

/**
 * Embeds texts with a pinned model. A different model than the one recorded on
 * the index is refused: comparing vectors from two models silently produces
 * meaningless rankings, which is exactly the bug this guards against.
 */
export async function embedPinned(
  texts: string[],
  pinnedModel: string | null | undefined
): Promise<EmbeddingBatch> {
  if (texts.length === 0) {
    return { vectors: [], model: pinnedModel || "none", provider: "lexical", dim: 0 };
  }
  const result = await embedTexts(texts, pinnedModel || undefined);
  if (!result) {
    throw new EmbeddingUnavailableError(
      "No embedding provider is available. Start Ollama with an embedding model, or load one in Foundry Local, then sync again."
    );
  }
  if (pinnedModel && result.model !== pinnedModel) {
    throw new EmbeddingModelMismatchError(
      `Embedding model changed: the index was built with "${pinnedModel}" but the runtime served "${result.model}". Re-sync the whole base or restore the original model; mixing models would corrupt ranking.`
    );
  }
  const vectors = result.vectors.map((vec) => normalizeVector(vec));
  const dim = vectors[0]?.length ?? 0;
  if (vectors.some((vec) => vec.length !== dim)) {
    throw new Error("The embedding provider returned vectors of inconsistent length.");
  }
  return { vectors, model: result.model, provider: result.provider, dim };
}

/**
 * Embeds a query with the model the index was built with. Returns null only
 * when no provider is reachable; a model mismatch throws so retrieval can say so.
 */
export async function embedQuery(
  query: string,
  pinnedModel: string | null | undefined
): Promise<{ vector: Float32Array; model: string } | null> {
  if (!pinnedModel) return null;
  try {
    const batch = await embedPinned([query], pinnedModel);
    return { vector: batch.vectors[0], model: batch.model };
  } catch (error) {
    if (error instanceof EmbeddingUnavailableError) return null;
    throw error;
  }
}
