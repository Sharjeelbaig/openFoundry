// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { documentsEmptyMessage } from "../src/lib/data-empty-state";

describe("documentsEmptyMessage", () => {
  it("shows the loading message while the workspace loads", () => {
    expect(documentsEmptyMessage("", true)).toBe("Loading local data…");
    expect(documentsEmptyMessage("anything", true)).toBe("Loading local data…");
  });

  it("says the search matched nothing when a query is active", () => {
    expect(documentsEmptyMessage("zzz-no-such-document", false)).toBe(
      "No documents match this search."
    );
  });

  it("treats whitespace-only input as no query", () => {
    expect(documentsEmptyMessage("   ", false)).toBe(
      "No documents yet. Create a data asset and upload files."
    );
  });

  it("keeps the first-run message for a truly empty workspace", () => {
    expect(documentsEmptyMessage("", false)).toBe(
      "No documents yet. Create a data asset and upload files."
    );
  });
});
