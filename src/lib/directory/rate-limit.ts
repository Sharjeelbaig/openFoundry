// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export interface RateResult {
  ok: boolean;
  retryAfter: number;
}

/**
 * In-process, best effort. A restart clears it, and behind a reverse proxy the
 * address comes from a header. It exists to make guessing a code impractical,
 * not to be a billing-grade limiter.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateResult {
  if (buckets.size > MAX_KEYS) buckets.clear();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((time) => time > now - windowMs);
  if (bucket.hits.length >= limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((bucket.hits[0] + windowMs - now) / 1000)
    );
    buckets.set(key, bucket);
    return { ok: false, retryAfter };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, retryAfter: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}
