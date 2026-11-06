// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { listBuckets } from "../knowledge/s3";
import { accessToken, listDriveFiles } from "./google";
import type { ConnectionProvider } from "./catalog";

export interface TestResult {
  ok: boolean;
  detail: string;
  latencyMs: number;
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

/**
 * Proves a connection works by making the cheapest real call the provider
 * offers. Nothing here writes, and nothing accepts a 401 as "fine".
 */
export async function testConnection(
  connectionId: string,
  provider: ConnectionProvider,
  target: string,
  config: Record<string, unknown>,
  secret: Record<string, unknown>
): Promise<TestResult> {
  const started = Date.now();
  const done = (ok: boolean, detail: string): TestResult => ({
    ok,
    detail,
    latencyMs: Date.now() - started,
  });

  const cleanTarget = target.replace(/\/+$/, "");
  if (!cleanTarget) return done(false, "A target URL is required.");

  try {
    if (provider === "s3") {
      const buckets = await listBuckets({
        endpoint: cleanTarget,
        region: config.region || "us-east-1",
        accessKeyId: secret.accessKeyId,
        secretAccessKey: secret.secretAccessKey,
        bucket: "probe",
      });
      return done(
        true,
        buckets.length
          ? `Credentials accepted. ${buckets.length} bucket(s) visible.`
          : "Credentials accepted. No buckets are visible to this key."
      );
    }

    if (provider === "azure-blob") {
      const sas = String(secret.sas || "").replace(/^\?/, "");
      if (!sas) return done(false, "A SAS token is required.");
      const res = await fetch(`${cleanTarget}/?restype=service&comp=list&${sas}`, {
        signal: withTimeout(20_000),
      });
      if (res.status === 403) return done(false, "The SAS token was rejected (403).");
      if (!res.ok) return done(false, `Azure Blob returned ${res.status}.`);
      const body = await res.text();
      const containers = (body.match(/<Container>/g) || []).length;
      return done(true, `SAS accepted. ${containers} container(s) listed.`);
    }

    if (provider === "azure-ai-search") {
      const apiKey = String(secret.apiKey || "");
      if (!apiKey) return done(false, "An API key is required.");
      const version = String(config.apiVersion || "2024-07-01");
      const res = await fetch(
        `${cleanTarget}/indexes?api-version=${encodeURIComponent(version)}&$select=name`,
        { headers: { "api-key": apiKey }, signal: withTimeout(20_000) }
      );
      if (res.status === 401 || res.status === 403) {
        return done(false, "The API key was rejected.");
      }
      if (!res.ok) return done(false, `Azure AI Search returned ${res.status}.`);
      const body = (await res.json()) as { value?: unknown[] };
      return done(true, `Key accepted. ${body.value?.length ?? 0} index(es) visible.`);
    }

    if (provider === "google-drive") {
      const token = await accessToken(connectionId);
      const page = await listDriveFiles(token, "'root' in parents and trashed = false");
      return done(true, `Connected. ${page.files.length} item(s) visible in My Drive.`);
    }

    if (provider === "webdav") {
      const username = String(secret.username || "");
      const password = String(secret.password || "");
      if (!username) return done(false, "A username is required.");
      const res = await fetch(cleanTarget, {
        method: "PROPFIND",
        headers: {
          depth: "0",
          authorization: basicAuth(username, password),
          "content-type": "application/xml",
        },
        signal: withTimeout(20_000),
      });
      if (res.status === 401 || res.status === 403) {
        return done(false, "The username or password was rejected.");
      }
      if (res.status !== 207 && res.status !== 200) {
        return done(false, `WebDAV returned ${res.status}.`);
      }
      return done(true, "Authentication accepted.");
    }

    return done(false, `Unknown provider "${provider}".`);
  } catch (error) {
    return done(false, error instanceof Error ? error.message : String(error));
  }
}
