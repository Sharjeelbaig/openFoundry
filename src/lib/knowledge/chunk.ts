// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { createHash } from "crypto";

export interface ChunkDraft {
  text: string;
  heading: string | null;
  section: string | null;
  page: number | null;
  charStart: number;
  charEnd: number;
  tokenCount: number;
  chunkHash: string;
}

export interface ChunkOptions {
  /** Soft target in characters. ~4 characters per token, so 1800 ≈ 450 tokens. */
  targetChars?: number;
  /** Characters repeated between hard splits of one oversized block. */
  overlapChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetChars: 1800,
  overlapChars: 220,
};

/** Approximate token count. Documented as an approximation, never used for billing. */
export function approxTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

interface Block {
  text: string;
  start: number;
  end: number;
  level: number | null;
  headingText: string | null;
}

/**
 * Splits text into paragraph blocks while tracking Markdown heading levels and
 * form-feed page breaks (PDF text). Tables and fenced code stay inside one block
 * unless they exceed the budget.
 */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const parts = text.split(/\n{2,}|\f/);
  let cursor = 0;

  for (const part of parts) {
    const start = text.indexOf(part, cursor);
    const end = start + part.length;
    cursor = end;
    const trimmed = part.trim();
    if (!trimmed) continue;

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    blocks.push({
      text: trimmed,
      start,
      end,
      level: heading ? heading[1].length : null,
      headingText: heading ? heading[2].trim() : null,
    });
  }
  return blocks;
}

/**
 * Structure-aware chunking. Every chunk carries the heading breadcrumb, page and
 * exact character range so a citation can point at the right place.
 */
export function chunkDocument(
  raw: string,
  options: ChunkOptions = {}
): ChunkDraft[] {
  const { targetChars, overlapChars } = { ...DEFAULTS, ...options };
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];

  const blocks = toBlocks(text);
  if (blocks.length === 0) {
    const clean = text.trim();
    return [
      {
        text: clean,
        heading: null,
        section: null,
        page: null,
        charStart: 0,
        charEnd: clean.length,
        tokenCount: approxTokens(clean),
        chunkHash: hash(clean),
      },
    ];
  }

  const chunks: ChunkDraft[] = [];
  const headings: string[] = [];
  let page = 1;
  let pageCursor = 0;

  let buffer = "";
  let bufferStart = 0;
  let bufferEnd = 0;
  let bufferSection: string | null = null;
  let bufferPage: number | null = null;

  const flush = () => {
    const clean = buffer.trim();
    if (!clean) {
      buffer = "";
      return;
    }
    const withBreadcrumb = bufferSection
      ? `${bufferSection}\n\n${clean}`
      : clean;
    chunks.push({
      text: withBreadcrumb,
      heading: bufferSection
        ? bufferSection.split(" > ").slice(-1)[0]
        : null,
      section: bufferSection,
      page: bufferPage,
      charStart: bufferStart,
      charEnd: bufferEnd,
      tokenCount: approxTokens(withBreadcrumb),
      chunkHash: hash(withBreadcrumb),
    });
    buffer = "";
  };

  for (const block of blocks) {
    // Advance the page counter over the gap before this block.
    for (let i = pageCursor; i < block.start; i += 1) {
      if (text.charCodeAt(i) === 12) page += 1;
    }
    pageCursor = block.start;

    if (block.level != null && block.headingText != null) {
      // A new heading ends the current chunk so the breadcrumb stays accurate.
      if (buffer) flush();
      headings.length = block.level - 1;
      headings[block.level - 1] = block.headingText;
      // Drop empty slots created by skipped levels.
      const cleaned = headings.filter(Boolean);
      headings.length = 0;
      headings.push(...cleaned);
      continue;
    }

    const section = headings.length ? headings.join(" > ") : null;

    // A page break flushes the buffer so a chunk never spans two pages.
    if (buffer && bufferPage != null && page !== bufferPage) flush();

    if (!buffer) {
      bufferStart = block.start;
      bufferSection = section;
      bufferPage = page;
    }

    if (buffer && buffer.length + block.text.length + 2 > targetChars) {
      flush();
      bufferStart = block.start;
      bufferSection = section;
      bufferPage = page;
    }

    if (block.text.length <= targetChars) {
      buffer = buffer ? `${buffer}\n\n${block.text}` : block.text;
      bufferEnd = block.end;
      continue;
    }

    // Oversized block: hard split with overlap, keeping the heading.
    if (buffer) flush();
    let start = 0;
    while (start < block.text.length) {
      const end = Math.min(start + targetChars, block.text.length);
      const slice = block.text.slice(start, end).trim();
      if (slice) {
        const withBreadcrumb = section ? `${section}\n\n${slice}` : slice;
        chunks.push({
          text: withBreadcrumb,
          heading: section ? section.split(" > ").slice(-1)[0] : null,
          section,
          page,
          charStart: block.start + start,
          charEnd: block.start + end,
          tokenCount: approxTokens(withBreadcrumb),
          chunkHash: hash(withBreadcrumb),
        });
      }
      if (end === block.text.length) break;
      start = Math.max(end - overlapChars, start + 1);
    }
    bufferStart = block.start + block.text.length;
  }

  flush();
  return chunks;
}
