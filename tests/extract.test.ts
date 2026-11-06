// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { extractBuffer, isImageFile, looksScanned } from "@/lib/knowledge/extract";

describe("extraction decisions", () => {
  it("treats a short or empty text layer as scanned", () => {
    expect(looksScanned("")).toBe(true);
    expect(looksScanned("   \n\t ")).toBe(true);
    expect(looksScanned("Page 1")).toBe(true);
    expect(
      looksScanned(
        "This is a real paragraph with enough characters to be a text layer rather than a scan."
      )
    ).toBe(false);
  });

  it("recognises image extensions", () => {
    expect(isImageFile("scan.PNG")).toBe(true);
    expect(isImageFile("photo.jpeg")).toBe(true);
    expect(isImageFile("notes.txt")).toBe(false);
  });

  it("extracts plain text buffers", async () => {
    const result = await extractBuffer("notes.md", Buffer.from("# Title\n\nHello."));
    expect(result).toEqual({ text: "# Title\n\nHello.", kind: "text" });
  });

  it("rejects binary buffers with a clear message", async () => {
    await expect(
      extractBuffer("blob.bin", Buffer.from([0, 1, 2, 3]))
    ).rejects.toThrow(/no text layer|binary/i);
  });

  it("refuses DOCX instead of producing garbage", async () => {
    await expect(extractBuffer("report.docx", Buffer.from("PK"))).rejects.toThrow(
      /DOCX is not supported/i
    );
  });
});
