// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash, createHmac } from "crypto";
import type { SourceItem } from "./types";
import { extractBuffer } from "./extract";

/**
 * S3-compatible object storage without an SDK.
 *
 * Works with AWS S3, MinIO, Cloudflare R2, Backblaze B2 (S3 API) and Wasabi.
 * Path-style addressing is used because every one of them supports it.
 */

interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  maxObjectBytes: number;
  maxObjects: number;
}

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".html", ".htm",
  ".yaml", ".yml", ".xml", ".sql", ".log", ".ini", ".conf", ".toml", ".pdf",
]);

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%2F/g, "%2F");
}

function encodePath(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

/** Builds SigV4 headers. Exported so the signature can be tested without a bucket. */
export function signS3Request(
  config: S3Config,
  target: URL,
  extra: Record<string, string> = {},
  now: Date = new Date()
): Record<string, string> {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex("");

  const headers: Record<string, string> = {
    host: target.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extra,
  };
  if (config.sessionToken) headers["x-amz-security-token"] = config.sessionToken;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalQuery = [...target.searchParams.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");

  // CanonicalHeaders already ends with a newline; the extra one is the blank
  // line AWS requires between the headers block and SignedHeaders.
  const canonicalRequest =
    `GET\n${encodePath(target.pathname)}\n${canonicalQuery}\n` +
    `${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

async function signedFetch(
  config: S3Config,
  target: URL,
  extra: Record<string, string> = {}
): Promise<Response> {
  const headers = signS3Request(config, target, extra);
  const response = await fetch(target, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  return response;
}

interface ListedObject {
  key: string;
  size: number;
}

function parseList(xml: string): { objects: ListedObject[]; nextToken: string | null } {
  const objects: ListedObject[] = [];
  const blocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
  for (const block of blocks) {
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1] || "";
    const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] || 0);
    if (key) objects.push({ key, size });
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const nextToken = truncated
    ? /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] || null
    : null;
  return {
    objects,
    nextToken: nextToken ? nextToken.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : null,
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export interface S3Settings {
  endpoint?: string;
  region?: string;
  bucket: string;
  prefix?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  pathStyle?: boolean;
}

export function s3Config(raw: Record<string, unknown>): S3Config {
  const endpoint = String(raw.endpoint || "").replace(/\/+$/, "").trim();
  const region = String(raw.region || "us-east-1").trim() || "us-east-1";
  const bucket = String(raw.bucket || "").trim();
  const accessKeyId = String(raw.accessKeyId || "").trim();
  const secretAccessKey = String(raw.secretAccessKey || "").trim();
  return {
    endpoint: endpoint || `https://s3.${region}.amazonaws.com`,
    region,
    bucket,
    prefix: String(raw.prefix || "").trim(),
    accessKeyId,
    secretAccessKey,
    sessionToken: raw.sessionToken ? String(raw.sessionToken) : undefined,
    maxObjectBytes: Math.min(Number(raw.maxObjectBytes) || 20 * 1024 * 1024, 100 * 1024 * 1024),
    maxObjects: Math.min(Number(raw.maxObjects) || 500, 5000),
  };
}

export function validateS3(raw: Record<string, unknown>): string | null {
  const config = s3Config(raw);
  if (!config.bucket) return "A bucket name is required.";
  if (!config.accessKeyId) return "An access key ID is required.";
  if (!config.secretAccessKey) return "A secret access key is required.";
  try {
    new URL(config.endpoint);
  } catch {
    return "The endpoint must be a full URL, for example https://minio.local:9000.";
  }
  return null;
}

/** Lists buckets. Used to prove a connection's credentials before a bucket is chosen. */
export async function listBuckets(
  raw: Record<string, unknown>
): Promise<string[]> {
  const config = s3Config(raw);
  const url = new URL(`${config.endpoint}/`);
  const response = await signedFetch(config, url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`S3 list buckets failed with ${response.status}: ${body.slice(0, 200)}`);
  }
  return [...body.matchAll(/<Bucket>[\s\S]*?<Name>([\s\S]*?)<\/Name>[\s\S]*?<\/Bucket>/g)].map(
    (match) => decodeXml(match[1])
  );
}

export async function listObjects(
  raw: Record<string, unknown>
): Promise<{ objects: ListedObject[]; nextToken: string | null }> {
  const config = s3Config(raw);
  const url = new URL(`${config.endpoint}/${encodeRfc3986(config.bucket)}`);
  url.searchParams.set("list-type", "2");
  url.searchParams.set("max-keys", "1000");
  if (config.prefix) url.searchParams.set("prefix", config.prefix);
  const response = await signedFetch(config, url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`S3 list failed with ${response.status}: ${body.slice(0, 200)}`);
  }
  return parseList(body);
}

export async function getObject(
  raw: Record<string, unknown>,
  key: string
): Promise<{ body: Buffer; contentType: string }> {
  const config = s3Config(raw);
  const url = new URL(
    `${config.endpoint}/${encodeRfc3986(config.bucket)}/${encodePath(key)}`
  );
  const response = await signedFetch(config, url);
  if (!response.ok) {
    throw new Error(`S3 get ${key} failed with ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > config.maxObjectBytes) {
    throw new Error(`${key} exceeds the object size limit.`);
  }
  return { body: buffer, contentType: response.headers.get("content-type") || "" };
}

export async function discoverS3(
  raw: Record<string, unknown>
): Promise<SourceItem[]> {
  const config = s3Config(raw);
  const items: SourceItem[] = [];
  let token: string | null = null;
  let pages = 0;

  do {
    const url = new URL(`${config.endpoint}/${encodeRfc3986(config.bucket)}`);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("max-keys", "1000");
    if (config.prefix) url.searchParams.set("prefix", config.prefix);
    if (token) url.searchParams.set("continuation-token", token);
    const response = await signedFetch(config, url);
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`S3 list failed with ${response.status}: ${body.slice(0, 200)}`);
    }
    const page = parseList(body);
    for (const object of page.objects) {
      if (items.length >= config.maxObjects) break;
      const key = decodeXml(object.key);
      if (key.endsWith("/")) continue;
      const extension = key.slice(key.lastIndexOf(".")).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) continue;
      if (object.size > config.maxObjectBytes) {
        items.push({
          externalId: key,
          title: key.split("/").pop() || key,
          mime: "error",
          uri: `s3://${config.bucket}/${key}`,
          size: object.size,
          content: "",
          metadata: { error: `Object is ${object.size} bytes, over the limit.` },
        });
        continue;
      }
      try {
        const fetched = await getObject(raw, key);
        const extracted = await extractBuffer(key, fetched.body);
        const text = extracted.text;
        const mime = fetched.contentType || "text/plain";
        if (!text.trim()) continue;
        items.push({
          externalId: key,
          title: key.split("/").pop() || key,
          mime,
          uri: `s3://${config.bucket}/${key}`,
          size: Buffer.byteLength(text),
          content: text,
          metadata: {
            bucket: config.bucket,
            key,
            extraction: extracted.kind,
          },
        });
      } catch (error) {
        items.push({
          externalId: key,
          title: key.split("/").pop() || key,
          mime: "error",
          uri: `s3://${config.bucket}/${key}`,
          size: object.size,
          content: "",
          metadata: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }
    token = page.nextToken;
    pages += 1;
  } while (token && pages < 20 && items.length < config.maxObjects);

  return items;
}
