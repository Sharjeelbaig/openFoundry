// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/** Float32 vector storage helpers. Vectors are L2-normalised at write time. */

export function normalizeVector(vec: number[]): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum);
  const out = new Float32Array(vec.length);
  if (norm === 0) return out;
  for (let i = 0; i < vec.length; i += 1) out[i] = vec[i] / norm;
  return out;
}

export function vectorToBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function blobToVector(blob: Uint8Array): Float32Array {
  // Copy so the result does not alias a pooled Buffer.
  const copy = new Uint8Array(blob.byteLength);
  copy.set(blob);
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
}

/** Cosine similarity for two normalised vectors; dimension mismatch is a bug. */
export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}. Re-sync the source with the current embedding model.`
    );
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}
