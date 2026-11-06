// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import type { SourceItem } from "./types";

/**
 * WebDAV indexing. Depth-1 PROPFIND per folder, then GET per text file.
 * Works with Nextcloud, ownCloud and Box.
 */

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".html", ".htm",
  ".yaml", ".yml", ".xml", ".sql", ".log", ".ini", ".conf", ".toml",
]);

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function authHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export function validateWebdav(config: Record<string, unknown>): string | null {
  if (!String(config.target || "").trim()) return "A WebDAV connection is required.";
  if (!String(config.username || "").trim()) return "The connection has no username.";
  return null;
}

interface Entry {
  href: string;
  collection: boolean;
  size: number;
}

function parsePropfind(xml: string): Entry[] {
  const entries: Entry[] = [];
  const responses = xml.match(/<(?:d:)?response[\s\S]*?<\/(?:d:)?response>/gi) || [];
  for (const block of responses) {
    const href = /<(?:d:)?href[^>]*>([\s\S]*?)<\/(?:d:)?href>/i.exec(block)?.[1];
    if (!href) continue;
    const collection = /<(?:d:)?collection\s*\/?>/i.test(block);
    const size = Number(
      /<(?:d:)?getcontentlength[^>]*>(\d+)<\/(?:d:)?getcontentlength>/i.exec(block)?.[1] || 0
    );
    entries.push({ href: decodeXml(href), collection, size });
  }
  return entries;
}

async function propfind(base: string, username: string, password: string): Promise<Entry[]> {
  const response = await fetch(base, {
    method: "PROPFIND",
    headers: {
      depth: "1",
      authorization: authHeader(username, password),
      "content-type": "application/xml",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 207 && response.status !== 200) {
    throw new Error(`WebDAV PROPFIND failed with ${response.status}.`);
  }
  return parsePropfind(await response.text());
}

export async function discoverWebdav(
  config: Record<string, unknown>
): Promise<SourceItem[]> {
  const base = String(config.target).replace(/\/+$/, "");
  const username = String(config.username || "");
  const password = String(config.password || "");
  const root = new URL(`${base}/${config.path ? String(config.path).replace(/^\/+|\/+$/g, "") + "/" : ""}`);
  const maxFiles = Math.min(Number(config.maxFiles) || 500, 2000);
  const items: SourceItem[] = [];
  const queue: string[] = [root.toString()];
  const seen = new Set<string>();

  while (queue.length && items.length < maxFiles) {
    const folder = queue.shift()!;
    if (seen.has(folder)) continue;
    seen.add(folder);
    const entries = await propfind(folder, username, password);
    for (const entry of entries) {
      const url = new URL(entry.href, folder).toString();
      if (url === folder || seen.has(url)) continue;
      if (entry.collection) {
        queue.push(url.endsWith("/") ? url : `${url}/`);
        continue;
      }
      const extension = url.slice(url.lastIndexOf(".")).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) continue;
      try {
        const response = await fetch(url, {
          headers: { authorization: authHeader(username, password) },
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`GET ${url} returned ${response.status}.`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.includes(0)) throw new Error("Binary file skipped: no text layer.");
        const text = buffer.toString("utf8");
        if (!text.trim()) continue;
        const name = decodeURIComponent(url.split("/").pop() || url);
        items.push({
          externalId: url,
          title: name,
          mime: "text/plain",
          uri: url,
          size: Buffer.byteLength(text),
          content: text,
          metadata: { href: url },
        });
      } catch (error) {
        items.push({
          externalId: url,
          title: url.split("/").pop() || url,
          mime: "error",
          uri: url,
          size: entry.size,
          content: "",
          metadata: { error: error instanceof Error ? error.message : String(error) },
        });
      }
      if (items.length >= maxFiles) break;
    }
  }

  return items;
}
