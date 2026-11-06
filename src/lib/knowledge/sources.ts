// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { lookup } from "dns/promises";
import { DatabaseSync } from "node:sqlite";
import type { Connector, SourceItem, SourceKind } from "./types";
import { discoverS3, validateS3 } from "./s3";
import { extractBuffer, extractFile } from "./extract";
import { discoverAzureBlob, validateAzureBlob } from "./azure-blob";
import { discoverWebdav, validateWebdav } from "./webdav";
import { discoverGoogleDrive, validateGoogleDrive } from "./google-drive";

const execFileAsync = promisify(execFile);

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".html", ".htm",
  ".yaml", ".yml", ".xml", ".sql", ".log", ".ini", ".conf", ".toml",
  ".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".c", ".h", ".cpp", ".hpp", ".cs", ".php", ".sh", ".zsh", ".ps1",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".cache", "dist", "build", "out", "vendor",
  "__pycache__", ".venv", "venv", "target", ".idea", ".vscode", ".desktop-cache",
]);

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 2000;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

async function readFileText(file: string, maxBytes = MAX_FILE_BYTES): Promise<string> {
  const stat = await fs.stat(file);
  if (stat.size > maxBytes) {
    throw new Error(
      `File is ${Math.round(stat.size / 1024 / 1024)} MB, over the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`
    );
  }
  return (await extractFile(file)).text;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/** Minimal HTML to text: drops non-content elements and keeps block structure. */
export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/table|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<h([1-6])[^>]*>/gi, (_m, level) => `\n${"#".repeat(Number(level))} `)
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(cleaned)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/** Rejects loopback, link-local, private ranges and the metadata endpoint. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error(`Refusing to fetch a private host: ${host}`);
  }
  let addresses: string[] = [];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    addresses = [host];
  } else {
    try {
      const found = await lookup(host, { all: true });
      addresses = found.map((item) => item.address);
    } catch {
      throw new Error(`Could not resolve ${host}.`);
    }
  }
  for (const address of addresses) {
    if (address.includes(":")) {
      if (
        address === "::1" ||
        address.startsWith("fe80:") ||
        address.startsWith("fc") ||
        address.startsWith("fd") ||
        address === "::"
      ) {
        throw new Error(`Refusing to fetch a private address: ${address}`);
      }
      continue;
    }
    if (PRIVATE_V4.some((pattern) => pattern.test(address))) {
      throw new Error(`Refusing to fetch a private address: ${address}`);
    }
  }
  return url;
}

async function fetchTextPage(url: string, maxBytes: number): Promise<SourceItem> {
  const parsed = await assertPublicUrl(url);
  const res = await fetch(parsed, {
    headers: { "user-agent": "openFoundry-knowledge/1.0", accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const contentType = res.headers.get("content-type") || "";
  if (!/text\/|html|xml|json/i.test(contentType)) {
    throw new Error(`Unsupported content type "${contentType}" at ${url}`);
  }
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Page exceeds ${Math.round(maxBytes / 1024 / 1024)} MB at ${url}`);
      }
      chunks.push(value);
    }
  }
  const body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
  const isHtml = /html/i.test(contentType) || /<html/i.test(body.slice(0, 500));
  const extracted = isHtml ? htmlToText(body) : { title: url, text: body };
  if (!extracted.text.trim()) throw new Error(`No readable text at ${url}`);
  return {
    externalId: parsed.toString(),
    title: extracted.title || parsed.pathname || parsed.host,
    mime: isHtml ? "text/html" : "text/plain",
    uri: parsed.toString(),
    size: Buffer.byteLength(extracted.text),
    content: extracted.text,
    metadata: { url: parsed.toString() },
  };
}

function originOf(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function sameOriginLinks(html: string, base: string, origin: string): string[] {
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const out = new Set<string>();
  for (const href of hrefs) {
    try {
      const url = new URL(href, base);
      if (url.origin === origin && (url.protocol === "http:" || url.protocol === "https:")) {
        url.hash = "";
        out.add(url.toString());
      }
    } catch {
      // ignore malformed links
    }
  }
  return [...out];
}

async function walk(root: string, include: string[], exclude: string[]): Promise<string[]> {
  const resolvedRoot = path.resolve(root);
  const stat = await fs.stat(resolvedRoot).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Folder not found: ${root}`);

  const matches = (file: string, patterns: string[]) =>
    patterns.length === 0
      ? true
      : patterns.some((pattern) => {
          const clean = pattern.replace(/^\*\*?\/?/, "").replace(/\/?\*$/, "");
          return file.includes(clean) || path.extname(file) === clean;
        });

  const files: string[] = [];
  const queue = [resolvedRoot];
  while (queue.length) {
    const dir = queue.shift()!;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        queue.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(resolvedRoot, full);
      if (exclude.length && matches(relative, exclude)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (include.length) {
        if (!matches(relative, include)) continue;
      } else if (!TEXT_EXTENSIONS.has(ext)) {
        continue;
      }
      files.push(full);
      if (files.length >= MAX_FILES) break;
    }
    if (files.length >= MAX_FILES) break;
  }
  return files.sort();
}

/** Minimal CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell.trim().length > 0));
}

const folderConnector: Connector = {
  kind: "folder",
  mode: "indexed",
  validate(config) {
    if (!asString(config.path)) return "A folder path is required.";
    return null;
  },
  async discover(ctx) {
    const root = asString(ctx.config.path);
    const include = asStringArray(ctx.config.include);
    const exclude = asStringArray(ctx.config.exclude);
    const maxBytes = asNumber(ctx.config.maxFileBytes, MAX_FILE_BYTES);
    const files = await walk(root, include, exclude);
    const items: SourceItem[] = [];
    for (let index = 0; index < files.length; index += 1) {
      if (ctx.signal?.aborted) break;
      const file = files[index];
      ctx.onProgress?.(index, files.length, path.basename(file));
      try {
        const content = await readFileText(file, maxBytes);
        if (!content.trim()) continue;
        items.push({
          externalId: path.relative(path.resolve(root), file),
          title: path.basename(file),
          mime: path.extname(file).toLowerCase() === ".pdf" ? "application/pdf" : "text/plain",
          uri: file,
          size: Buffer.byteLength(content),
          content,
          metadata: { path: file },
        });
      } catch {
        // Per-file failures are counted by the sync layer.
        items.push({
          externalId: path.relative(path.resolve(root), file),
          title: path.basename(file),
          mime: "skip",
          uri: file,
          size: 0,
          content: "",
        });
      }
    }
    return items;
  },
};

const webConnector: Connector = {
  kind: "web",
  mode: "indexed",
  validate(config) {
    const urls = asStringArray(config.urls);
    if (urls.length === 0) return "At least one URL is required.";
    for (const url of urls) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return `Only http(s) URLs are supported: ${url}`;
        }
      } catch {
        return `Not a valid URL: ${url}`;
      }
    }
    return null;
  },
  async discover(ctx) {
    const urls = asStringArray(ctx.config.urls);
    const follow = ctx.config.followLinks === true;
    const maxPages = Math.min(asNumber(ctx.config.maxPages, 20), 200);
    const maxBytes = asNumber(ctx.config.maxBytes, 5 * 1024 * 1024);
    const seen = new Set<string>();
    const items: SourceItem[] = [];
    const queue = [...urls];

    while (queue.length && items.length < maxPages) {
      if (ctx.signal?.aborted) break;
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      ctx.onProgress?.(items.length, Math.min(maxPages, queue.length + items.length + 1), url);
      try {
        const item = await fetchTextPage(url, maxBytes);
        items.push(item);
        if (follow && items.length < maxPages) {
          const origin = originOf(url);
          const links = sameOriginLinks(item.content, url, origin);
          for (const link of links.slice(0, 50)) {
            if (!seen.has(link)) queue.push(link);
          }
        }
      } catch (error) {
        items.push({
          externalId: url,
          title: url,
          mime: "error",
          uri: url,
          size: 0,
          content: "",
          metadata: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }
    return items;
  },
};

const sqliteConnector: Connector = {
  kind: "sqlite",
  mode: "indexed",
  validate(config) {
    if (!asString(config.path)) return "A database file path is required.";
    if (!asString(config.table)) return "A table or view name is required.";
    if (asStringArray(config.textColumns).length === 0)
      return "Choose at least one text column.";
    return null;
  },
  async discover(ctx) {
    const file = asString(ctx.config.path);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) throw new Error(`Database not found: ${file}`);
    const table = asString(ctx.config.table);
    if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error("Invalid table name.");
    const columns = asStringArray(ctx.config.textColumns).filter((c) =>
      /^[A-Za-z0-9_]+$/.test(c)
    );
    const titleColumn = asString(ctx.config.titleColumn);
    const db = new DatabaseSync(file);
    try {
      const rows = db
        .prepare(`SELECT * FROM "${table}"`)
        .all() as Record<string, unknown>[];
      return rows.map((row, index) => {
        const text = columns
          .map((column) => `${column}: ${row[column] ?? ""}`)
          .join("\n");
        const title =
          (titleColumn ? String(row[titleColumn] ?? "") : "") || `${table} row ${index + 1}`;
        return {
          externalId: `${table}:${index}`,
          title,
          mime: "text/plain",
          uri: `${file}#${table}:${index}`,
          size: Buffer.byteLength(text),
          content: text,
          metadata: { table, row: index },
        };
      });
    } finally {
      db.close();
    }
  },
};

const csvConnector: Connector = {
  kind: "csv",
  mode: "indexed",
  validate(config) {
    if (!asString(config.path) && !Array.isArray(config.rows))
      return "A CSV file path is required.";
    return null;
  },
  async discover(ctx) {
    const raw =
      asString(ctx.config.path)
        ? await fs.readFile(asString(ctx.config.path), "utf8")
        : "";
    const delimiter = asString(ctx.config.delimiter) || ",";
    const rows = parseCsv(raw, delimiter);
    if (rows.length === 0) return [];
    const header = rows[0];
    const body = rows.slice(1);
    return body.map((row, index) => {
      const text = header
        .map((column, i) => `${column}: ${row[i] ?? ""}`)
        .join("\n");
      const titleColumn = asString(ctx.config.titleColumn);
      const title =
        (titleColumn ? row[header.indexOf(titleColumn)] : "") || `Row ${index + 2}`;
      return {
        externalId: `row:${index + 2}`,
        title,
        mime: "text/csv",
        uri: asString(ctx.config.path) || undefined,
        size: Buffer.byteLength(text),
        content: text,
        metadata: { row: index + 2 },
      };
    });
  },
};

const sharePointExportConnector: Connector = {
  kind: "sharepoint-export",
  mode: "indexed",
  validate: (config) => folderConnector.validate(config),
  async discover(ctx) {
    const items = await folderConnector.discover(ctx);
    return items.map((item) => ({
      ...item,
      metadata: { ...item.metadata, sharePointExport: true },
    }));
  },
};

function objectLines(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([key, entry]) => `${key}: ${typeof entry === "string" ? entry : JSON.stringify(entry)}`)
    .join("\n");
}

const fabricExportConnector: Connector = {
  kind: "fabric-export",
  mode: "indexed",
  validate(config) {
    if (!asString(config.path)) return "An export folder is required.";
    return null;
  },
  async discover(ctx) {
    const root = asString(ctx.config.path);
    const delimiter = asString(ctx.config.delimiter) || ",";
    const titleColumn = asString(ctx.config.titleColumn);
    const maxRows = Math.min(asNumber(ctx.config.maxRows, 5000), 50000);
    const files = await walk(root, [".csv", ".jsonl", ".json"], []);
    const items: SourceItem[] = [];
    for (const file of files) {
      if (ctx.signal?.aborted || items.length >= maxRows) break;
      const relative = path.relative(path.resolve(root), file);
      const extension = path.extname(file).toLowerCase();
      try {
        if (extension === ".csv") {
          const rows = parseCsv(await fs.readFile(file, "utf8"), delimiter);
          if (!rows.length) continue;
          const header = rows[0];
          for (let index = 1; index < rows.length && items.length < maxRows; index += 1) {
            const row = rows[index];
            const value = Object.fromEntries(
              header.map((column, columnIndex) => [column, row[columnIndex] ?? ""])
            );
            const text = objectLines(value);
            if (!text.trim()) continue;
            const title =
              (titleColumn ? String(value[titleColumn] ?? "") : "") ||
              `${path.basename(file)} row ${index + 1}`;
            items.push({
              externalId: `${relative}:${index + 1}`,
              title,
              mime: "text/csv",
              uri: `${file}#row=${index + 1}`,
              size: Buffer.byteLength(text),
              content: text,
              metadata: {
                fabricExport: true,
                file: relative,
                row: index + 1,
              },
            });
          }
        } else {
          const raw = await fs.readFile(file, "utf8");
          const rows: Record<string, unknown>[] = [];
          if (extension === ".jsonl") {
            for (const line of raw.split(/\r?\n/)) {
              if (!line.trim()) continue;
              const parsed = JSON.parse(line) as unknown;
              rows.push(
                parsed && typeof parsed === "object" && !Array.isArray(parsed)
                  ? (parsed as Record<string, unknown>)
                  : { value: parsed }
              );
            }
          } else {
            const parsed = JSON.parse(raw) as unknown;
            const list = Array.isArray(parsed) ? parsed : [parsed];
            for (const entry of list) {
              rows.push(
                entry && typeof entry === "object" && !Array.isArray(entry)
                  ? (entry as Record<string, unknown>)
                  : { value: entry }
              );
            }
          }
          for (let index = 0; index < rows.length && items.length < maxRows; index += 1) {
            const value = rows[index];
            const text = objectLines(value);
            if (!text.trim()) continue;
            const title =
              (titleColumn ? String(value[titleColumn] ?? "") : "") ||
              `${path.basename(file)} row ${index + 1}`;
            items.push({
              externalId: `${relative}:${index + 1}`,
              title,
              mime: "application/json",
              uri: `${file}#row=${index + 1}`,
              size: Buffer.byteLength(text),
              content: text,
              metadata: {
                fabricExport: true,
                file: relative,
                row: index + 1,
              },
            });
          }
        }
      } catch (error) {
        items.push({
          externalId: relative,
          title: path.basename(file),
          mime: "error",
          uri: file,
          size: 0,
          content: "",
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    return items;
  },
};

const gitConnector: Connector = {
  kind: "git",
  mode: "indexed",
  validate(config) {
    if (!asString(config.path)) return "A repository path is required.";
    return null;
  },
  async discover(ctx) {
    const root = path.resolve(asString(ctx.config.path));
    const { stdout } = await execFileAsync("git", ["-C", root, "ls-files"], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const files = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && TEXT_EXTENSIONS.has(path.extname(line).toLowerCase()));
    const items: SourceItem[] = [];
    for (let index = 0; index < files.length; index += 1) {
      if (ctx.signal?.aborted) break;
      const relative = files[index];
      ctx.onProgress?.(index, files.length, relative);
      try {
        const content = await readFileText(path.join(root, relative));
        if (!content.trim()) continue;
        items.push({
          externalId: relative,
          title: path.basename(relative),
          mime: "text/plain",
          uri: path.join(root, relative),
          size: Buffer.byteLength(content),
          content,
          metadata: { path: relative },
        });
      } catch {
        items.push({
          externalId: relative,
          title: path.basename(relative),
          mime: "skip",
          uri: path.join(root, relative),
          size: 0,
          content: "",
        });
      }
    }
    return items;
  },
};

/**
 * Uploads are not discovered: the route receives the bytes and calls the sync
 * service directly. The entry exists so the catalog and dialog are uniform.
 */
const fileConnector: Connector = {
  kind: "file",
  mode: "indexed",
  validate() {
    return null;
  },
  async discover() {
    return [];
  },
};

const s3Connector: Connector = {
  kind: "s3",
  mode: "indexed",
  validate: (config) => validateS3(config),
  async discover(ctx) {
    return discoverS3(ctx.config);
  },
};

const azureBlobConnector: Connector = {
  kind: "azure-blob",
  mode: "indexed",
  validate: (config) => validateAzureBlob(config),
  async discover(ctx) {
    return discoverAzureBlob(ctx.config);
  },
};

const googleDriveConnector: Connector = {
  kind: "google-drive",
  mode: "indexed",
  validate: (config) => validateGoogleDrive(config),
  async discover(ctx) {
    return discoverGoogleDrive(ctx.config);
  },
};

const webdavConnector: Connector = {
  kind: "webdav",
  mode: "indexed",
  validate: (config) => validateWebdav(config),
  async discover(ctx) {
    return discoverWebdav(ctx.config);
  },
};

export const CONNECTORS: Partial<Record<SourceKind, Connector>> = {
  file: fileConnector,
  s3: s3Connector,
  "azure-blob": azureBlobConnector,
  webdav: webdavConnector,
  "google-drive": googleDriveConnector,
  folder: folderConnector,
  "sharepoint-export": sharePointExportConnector,
  "fabric-export": fabricExportConnector,
  web: webConnector,
  sqlite: sqliteConnector,
  csv: csvConnector,
  git: gitConnector,
};

export function connectorFor(kind: SourceKind): Connector | null {
  return CONNECTORS[kind] || null;
}

/**
 * Extracts text from an uploaded buffer. PDFs without a text layer and images
 * go through OCR; the extraction kind is returned so the document can record it.
 */
export async function extractUpload(
  name: string,
  buffer: Buffer,
  mime: string
): Promise<{ text: string; mime: string; kind: string }> {
  const extracted = await extractBuffer(name, buffer);
  return {
    text: extracted.text,
    mime: mime || "text/plain",
    kind: extracted.kind,
  };
}
