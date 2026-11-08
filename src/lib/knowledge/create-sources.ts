// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { catalogEntry } from "./catalog";
import type { SourceKind } from "./types";

/**
 * Legacy knowledge-source kinds sent by older create-page payloads that did not
 * include `catalogKind`. `azure-blob` is deliberately absent: the legacy picker
 * reused that label for SQLite, S3 and GCS too, so only `catalogKind` can tell
 * them apart. Callers must send it for anything beyond the two mappings below.
 */
const LEGACY_KIND: Record<string, SourceKind> = {
  upload: "file",
  "fabric-iq": "fabric-data-agent",
};

/**
 * Resolve the real `SourceKind` for a source the create page handed over.
 *
 * Prefers the explicit `catalogKind`; falls back to the legacy `kind` for the
 * two unambiguous mappings. Returns null for an unknown kind so the caller skips
 * it instead of inserting a bogus source.
 */
export function normalizeSourceKind(
  kind?: string | null,
  catalogKind?: string | null
): SourceKind | null {
  const candidate = (catalogKind || kind || "").trim();
  if (!candidate) return null;
  if (catalogEntry(candidate as SourceKind)) return candidate as SourceKind;
  return LEGACY_KIND[candidate] ?? null;
}
