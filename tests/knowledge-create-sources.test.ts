// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { normalizeSourceKind } from "../src/lib/knowledge/create-sources";

describe("normalizeSourceKind", () => {
  it("prefers the explicit catalogKind", () => {
    expect(normalizeSourceKind("upload", "file")).toBe("file");
    // sqlite/s3/gcs all send the legacy "azure-blob" kind; catalogKind wins.
    expect(normalizeSourceKind("azure-blob", "sqlite")).toBe("sqlite");
    expect(normalizeSourceKind("azure-blob", "s3")).toBe("s3");
    expect(normalizeSourceKind("azure-blob", "azure-blob")).toBe("azure-blob");
  });

  it("maps the two unambiguous legacy kinds", () => {
    expect(normalizeSourceKind("upload")).toBe("file");
    expect(normalizeSourceKind("fabric-iq")).toBe("fabric-data-agent");
  });

  it("accepts a real kind when no catalogKind is present", () => {
    expect(normalizeSourceKind("web")).toBe("web");
    expect(normalizeSourceKind("azure-ai-search")).toBe("azure-ai-search");
  });

  it("rejects anything it cannot identify", () => {
    expect(normalizeSourceKind()).toBeNull();
    expect(normalizeSourceKind(null, null)).toBeNull();
    expect(normalizeSourceKind("")).toBeNull();
    expect(normalizeSourceKind("   ")).toBeNull();
    expect(normalizeSourceKind("not-a-real-kind")).toBeNull();
    // "azure-blob" alone is ambiguous (sqlite/s3/gcs reuse it); without a
    // catalogKind we cannot guess, so it resolves to the literal azure-blob.
    expect(normalizeSourceKind("azure-blob")).toBe("azure-blob");
  });

  it("trims whitespace around the kind", () => {
    expect(normalizeSourceKind(" web ")).toBe("web");
    expect(normalizeSourceKind("upload", "  file  ")).toBe("file");
  });
});
