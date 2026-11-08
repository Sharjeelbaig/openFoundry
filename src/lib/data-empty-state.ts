// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * The message the Data assets table shows when it has no rows. A filtered
 * result with no matches is not an empty workspace, and saying "No documents
 * yet" there reads as data loss (OS-30).
 */
export function documentsEmptyMessage(query: string, loading: boolean): string {
  if (loading) return "Loading local data…";
  if (query.trim()) return "No documents match this search.";
  return "No documents yet. Create a data asset and upload files.";
}
