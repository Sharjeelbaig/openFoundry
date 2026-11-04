// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Free web search through DuckDuckGo HTML endpoints. No API key, no cloud
 * resource. Returns an empty list when the provider is unreachable so the
 * local model can still answer from its own knowledge.
 */
export async function searchWeb(query: string, limit = 4): Promise<WebResult[]> {
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const html = await res.text();
      const results: WebResult[] = [];
      const anchor = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let match: RegExpExecArray | null;
      while ((match = anchor.exec(html)) && results.length < limit) {
        let url = match[1];
        const redirect = url.match(/uddg=([^&]+)/);
        if (redirect) url = decodeURIComponent(redirect[1]);
        results.push({ title: stripTags(match[2]), url, snippet: "" });
      }
      if (results.length === 0) {
        // Lite layout: links followed by snippet cells.
        const linkRe = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        while ((match = linkRe.exec(html)) && results.length < limit) {
          results.push({
            title: stripTags(match[2]),
            url: match[1],
            snippet: "",
          });
        }
      }
      const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let index = 0;
      while ((match = snippetRe.exec(html)) && index < results.length) {
        results[index].snippet = stripTags(match[1]);
        index += 1;
      }
      if (results.length > 0) return results.filter((item) => item.title);
    } catch {
      // try the next endpoint
    }
  }
  return [];
}

export function tryCalculate(expression: string): string | null {
  const clean = expression.trim().replace(/[=?]+$/, "").trim();

  // Natural phrasing: "18% of 2450" or "what is 18 percent of 2450".
  const percent = clean.match(
    /(-?\d+(?:\.\d+)?)\s*(?:%|percent)\s*of\s*(-?\d+(?:\.\d+)?)/i
  );
  if (percent) {
    const a = Number(percent[1]);
    const b = Number(percent[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return `${percent[1]}% of ${percent[2]} = ${(a / 100) * b}`;
    }
  }

  // Pick the longest arithmetic-looking run in the sentence.
  const candidates =
    clean.match(/-?\d[\d\s.+\-*/()%^]*\d/g)?.map((item) => item.trim()) || [];
  for (const candidate of candidates.sort((a, b) => b.length - a.length)) {
    if (!/^[\d\s.+\-*/()%^]+$/.test(candidate)) continue;
    if (!/[+\-*/^%]/.test(candidate)) continue;
    try {
      const normalized = candidate.replace(/\^/g, "**");
      // Only digits, operators, parentheses and dots reached this point.
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${normalized});`)() as unknown;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      return `${candidate} = ${value}`;
    } catch {
      continue;
    }
  }

  if (!/^[\d\s.+\-*/()%^]+$/.test(clean)) return null;
  if (!/[+\-*/^%]/.test(clean)) return null;
  try {
    const normalized = clean.replace(/\^/g, "**");
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${normalized});`)() as unknown;
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return `${clean} = ${value}`;
  } catch {
    return null;
  }
}
