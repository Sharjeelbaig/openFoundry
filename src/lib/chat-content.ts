// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { MessageContentPart } from "./types";

/** True when a message carries an image part. */
export function hasImageParts(
  content: string | MessageContentPart[]
): boolean {
  return Array.isArray(content) && content.some((part) => part.type === "image_url");
}

/** Flattens a message's text parts. Used for traces, guardrails and retrieval. */
export function messageText(content: string | MessageContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

/** Data URL for an uploaded image, capped so a single message stays small. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function imagePart(dataUrl: string): MessageContentPart {
  return { type: "image_url", image_url: { url: dataUrl } };
}

export function textPart(text: string): MessageContentPart {
  return { type: "text", text };
}
