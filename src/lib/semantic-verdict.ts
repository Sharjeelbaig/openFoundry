// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Pure parsing for the semantic classifier. Kept separate from the
 * server-only classifier so the JSON contract can be tested directly.
 */
export interface SemanticVerdict {
  unsafe: boolean;
  categories: string[];
  reason: string;
}

export function parseSemanticVerdict(text: string): SemanticVerdict | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      unsafe?: unknown;
      categories?: unknown;
      reason?: unknown;
    };
    const valid =
      typeof parsed.unsafe === "boolean" ||
      (typeof parsed.unsafe === "string" &&
        ["true", "false"].includes(parsed.unsafe.toLowerCase()));
    if (!valid) return null;
    return {
      unsafe:
        parsed.unsafe === true ||
        (typeof parsed.unsafe === "string" &&
          parsed.unsafe.toLowerCase() === "true"),
      categories: Array.isArray(parsed.categories)
        ? parsed.categories
            .filter((item): item is string => typeof item === "string")
            .slice(0, 8)
        : [],
      reason:
        typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "",
    };
  } catch {
    return null;
  }
}
