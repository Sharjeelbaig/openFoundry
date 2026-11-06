// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { signS3Request, s3Config, validateS3 } from "@/lib/knowledge/s3";
import { chunkDocument } from "@/lib/knowledge/chunk";
import { parseCsv } from "@/lib/knowledge/sources";
import { rrf } from "@/lib/knowledge/retrieve";

describe("S3 SigV4", () => {
  it("matches the published AWS GET object example", () => {
    const config = s3Config({
      endpoint: "https://examplebucket.s3.amazonaws.com",
      region: "us-east-1",
      bucket: "examplebucket",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    });
    const headers = signS3Request(
      config,
      new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      { range: "bytes=0-9" },
      new Date("2013-05-24T00:00:00Z")
    );
    expect(headers["x-amz-date"]).toBe("20130524T000000Z");
    expect(headers.authorization).toContain(
      "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date"
    );
    expect(headers.authorization).toContain(
      "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    );
  });

  it("refuses incomplete credentials", () => {
    expect(validateS3({ bucket: "docs" })).toMatch(/access key/i);
    expect(validateS3({ bucket: "", accessKeyId: "a", secretAccessKey: "b" })).toMatch(
      /bucket/i
    );
  });
});

describe("chunkDocument", () => {
  it("carries the heading breadcrumb and character range", () => {
    const text = "# Expenses\n\nThe cap is 42 dollars.\n\n## Approvals\n\nA manager approves overages.";
    const chunks = chunkDocument(text);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].section).toBe("Expenses");
    expect(chunks[0].text).toContain("Expenses");
    const approvals = chunks.find((chunk) => chunk.section === "Expenses > Approvals");
    expect(approvals).toBeTruthy();
    expect(approvals!.text).toContain("manager");
    expect(approvals!.charStart).toBeGreaterThan(0);
    expect(approvals!.charEnd).toBeGreaterThan(approvals!.charStart!);
  });

  it("tracks form-feed page breaks from PDF text", () => {
    const chunks = chunkDocument("page one text\fpage two text");
    expect(chunks[0].page).toBe(1);
    const second = chunks.find((chunk) => chunk.text.includes("page two"));
    expect(second?.page).toBe(2);
  });

  it("hard-splits an oversized paragraph with overlap", () => {
    const chunks = chunkDocument("x".repeat(5000), { targetChars: 1000, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });
});

describe("RRF fusion", () => {
  it("ranks a document found by both lists first", () => {
    const fused = rrf([
      [
        { chunkId: "a", score: 9 },
        { chunkId: "b", score: 8 },
      ],
      [
        { chunkId: "b", score: 0.9 },
        { chunkId: "c", score: 0.8 },
      ],
    ]);
    expect(fused[0].chunkId).toBe("b");
    expect(fused.map((item) => item.chunkId).sort()).toEqual(["a", "b", "c"]);
    expect(fused[0].score).toBeCloseTo(1 / 62 + 1 / 61, 10);
  });
});

describe("CSV parsing", () => {
  it("handles quotes, escapes and CRLF", () => {
    const rows = parseCsv('name,note\r\n"Smith, A.","said ""hi"""\r\n');
    expect(rows[1]).toEqual(["Smith, A.", 'said "hi"']);
  });
});
