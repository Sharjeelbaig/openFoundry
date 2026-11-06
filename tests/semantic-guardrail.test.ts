// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { parseSemanticVerdict } from "@/lib/semantic-verdict";

describe("semantic classifier verdict contract", () => {
  it("parses the required JSON object", () => {
    expect(
      parseSemanticVerdict(
        '{"unsafe":true,"categories":["violence"],"reason":"asks for bomb instructions"}'
      )
    ).toEqual({
      unsafe: true,
      categories: ["violence"],
      reason: "asks for bomb instructions",
    });
  });

  it("parses JSON inside a markdown fence", () => {
    expect(
      parseSemanticVerdict(
        '```json\n{"unsafe":false,"categories":[],"reason":"benign"}\n```'
      )
    ).toEqual({ unsafe: false, categories: [], reason: "benign" });
  });

  it("accepts string booleans some small models emit", () => {
    expect(
      parseSemanticVerdict('{"unsafe":"true","categories":["phishing"]}')
    ).toMatchObject({ unsafe: true, categories: ["phishing"] });
    expect(parseSemanticVerdict('{"unsafe":"false"}')).toMatchObject({
      unsafe: false,
    });
  });

  it("rejects prose, missing verdicts and malformed JSON", () => {
    expect(parseSemanticVerdict("this is safe")).toBeNull();
    expect(parseSemanticVerdict('{"categories":[]}')).toBeNull();
    expect(parseSemanticVerdict('{"unsafe":true')).toBeNull();
  });

  it("drops non-string categories and caps the reason", () => {
    const verdict = parseSemanticVerdict(
      JSON.stringify({
        unsafe: true,
        categories: ["violence", 42, null, "hate"],
        reason: "x".repeat(500),
      })
    );
    expect(verdict?.categories).toEqual(["violence", "hate"]);
    expect(verdict?.reason).toHaveLength(300);
  });
});
