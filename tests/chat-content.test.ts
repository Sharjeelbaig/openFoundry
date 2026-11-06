// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  hasImageParts,
  imagePart,
  messageText,
  textPart,
} from "@/lib/chat-content";

describe("chat content parts", () => {
  it("flattens text parts and ignores images", () => {
    expect(
      messageText([
        textPart("What is in this picture?"),
        imagePart("data:image/png;base64,AAAA"),
      ])
    ).toBe("What is in this picture?");
  });

  it("keeps a plain string untouched", () => {
    expect(messageText("hello")).toBe("hello");
  });

  it("detects image parts only when present", () => {
    expect(hasImageParts([textPart("hi")])).toBe(false);
    expect(
      hasImageParts([textPart("hi"), imagePart("data:image/png;base64,AAAA")])
    ).toBe(true);
    expect(hasImageParts("hi")).toBe(false);
  });

  it("builds the OpenAI image_url shape", () => {
    expect(imagePart("data:image/png;base64,AAAA")).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,AAAA" },
    });
  });
});
