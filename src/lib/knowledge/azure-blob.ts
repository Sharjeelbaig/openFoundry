// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import type { SourceItem } from "./types";
import { extractBuffer } from "./extract";

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".html", ".htm",
  ".yaml", ".yml", ".xml", ".sql", ".log", ".ini", ".conf", ".toml", ".pdf",
]);

function cleanSas(value: unknown): string {
  return String(value || "").replace(/^\?/, "");
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function validateAzureBlob(config: Record<string, unknown>): string | null {
  if (!String(config.endpoint || "").trim()) return "A Blob connection is required.";
  if (!String(config.container || "").trim()) return "A container name is required.";
  if (!cleanSas(config.sas)) return "The connection has no SAS token.";
  return null;
}

interface BlobEntry {
  name: string;
  size: number;
}

function parseBlobList(xml: string): { blobs: BlobEntry[]; next: string | null } {
  const blobs: BlobEntry[] = [];
  const blocks = xml.match(/<Blob>[\s\S]*?<\/Blob>/g) || [];
  for (const block of blocks) {
    const name = decodeXml(/<Name>([\s\S]*?)<\/Name>/.exec(block)?.[1] || "");
    const size = Number(/<Content-Length>(\d+)<\/Content-Length>/.exec(block)?.[1] || 0);
    if (name) blobs.push({ name, size });
  }
  const next = /<NextMarker>([\s\S]*?)<\/NextMarker>/.exec(xml)?.[1];
  return { blobs, next: next ? decodeXml(next) : null };
}

async function listBlobs(
  config: Record<string, unknown>,
  marker?: string
): Promise<{ blobs: BlobEntry[]; next: string | null }> {
  const endpoint = String(config.endpoint).replace(/\/+$/, "");
  const container = String(config.container);
  const sas = cleanSas(config.sas);
  const url = new URL(`${endpoint}/${encodeURIComponent(container)}`);
  url.searchParams.set("restype", "container");
  url.searchParams.set("comp", "list");
  url.searchParams.set("maxresults", "500");
  if (config.prefix) url.searchParams.set("prefix", String(config.prefix));
  if (marker) url.searchParams.set("marker", marker);
  const response = await fetch(`${url.toString()}&${sas}`, {
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Azure Blob list failed with ${response.status}: ${body.slice(0, 200)}`);
  }
  return parseBlobList(body);
}

async function readBlob(
  config: Record<string, unknown>,
  key: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const endpoint = String(config.endpoint).replace(/\/+$/, "");
  const container = String(config.container);
  const sas = cleanSas(config.sas);
  const url = `${endpoint}/${encodeURIComponent(container)}/${key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}?${sas}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Blob get ${key} failed with ${response.status}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "",
  };
}

export async function discoverAzureBlob(
  config: Record<string, unknown>
): Promise<SourceItem[]> {
  const maxBytes = Math.min(Number(config.maxObjectBytes) || 20 * 1024 * 1024, 100 * 1024 * 1024);
  const items: SourceItem[] = [];
  let marker: string | null = null;
  let pages = 0;

  do {
    const page = await listBlobs(config, marker || undefined);
    for (const blob of page.blobs) {
      const extension = blob.name.slice(blob.name.lastIndexOf(".")).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) continue;
      if (blob.size > maxBytes) {
        items.push({
          externalId: blob.name,
          title: blob.name.split("/").pop() || blob.name,
          mime: "error",
          uri: `azure-blob://${config.container}/${blob.name}`,
          size: blob.size,
          content: "",
          metadata: { error: `Blob is ${blob.size} bytes, over the limit.` },
        });
        continue;
      }
      try {
        const fetched = await readBlob(config, blob.name);
        const extracted = await extractBuffer(blob.name, fetched.buffer);
        const text = extracted.text;
        const mime = fetched.contentType || "text/plain";
        if (!text.trim()) continue;
        items.push({
          externalId: blob.name,
          title: blob.name.split("/").pop() || blob.name,
          mime,
          uri: `azure-blob://${config.container}/${blob.name}`,
          size: Buffer.byteLength(text),
          content: text,
          metadata: {
            container: config.container,
            key: blob.name,
            extraction: extracted.kind,
          },
        });
      } catch (error) {
        items.push({
          externalId: blob.name,
          title: blob.name.split("/").pop() || blob.name,
          mime: "error",
          uri: `azure-blob://${config.container}/${blob.name}`,
          size: blob.size,
          content: "",
          metadata: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }
    marker = page.next;
    pages += 1;
  } while (marker && pages < 20);

  return items;
}
