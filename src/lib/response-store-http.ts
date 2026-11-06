// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import type { ConversationItem } from "./conversations";
import {
  ResponseStoreHttpError,
  ResponseStoreQuotaError,
} from "./response-store-errors";
import { responseStoreConfig } from "./response-store-config";
import type {
  ResponseRetentionPolicy,
  ResponseStoreStats,
  StoredResponseHistory,
} from "./response-store";

/**
 * Client side of the shared response store. The server side lives at
 * /api/responses/store and is guarded by OPENFOUNDRY_RESPONSE_STORE_TOKEN.
 */

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = responseStoreConfig();
  if (config.backend !== "http" || !config.httpUrl || !config.httpToken) {
    throw new Error("The shared response store is not configured.");
  }
  const response = await fetch(`${config.httpUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.httpToken}`,
      ...(init.headers || {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as
    | T
    | { error?: string };
  if (!response.ok) {
    const error = body as { error?: string; code?: string };
    const message =
      error.error || `Shared response store returned ${response.status}.`;
    if (
      response.status === 429 ||
      response.status === 413 ||
      error.code === "quota_exceeded"
    ) {
      throw new ResponseStoreQuotaError(message, response.status);
    }
    throw new ResponseStoreHttpError(
      message,
      response.status,
      error.code || "store_error"
    );
  }
  return body as T;
}

export async function saveResponseHistoryRemote(
  id: string,
  items: ConversationItem[],
  ownerId = "project"
): Promise<void> {
  await request<{ ok: true }>("/save", {
    method: "POST",
    body: JSON.stringify({ id, items, ownerId }),
  });
}

export async function loadResponseHistoryRemote(
  id: string,
  ownerId = "project"
): Promise<StoredResponseHistory | null> {
  const result = await request<{ response: StoredResponseHistory | null }>(
    `/load?id=${encodeURIComponent(id)}&ownerId=${encodeURIComponent(ownerId)}`
  );
  return result.response;
}

export async function pruneResponsesRemote(ownerId?: string): Promise<void> {
  await request<{ ok: true }>("/prune", {
    method: "POST",
    body: JSON.stringify({ ownerId: ownerId || null }),
  });
}

export async function responseStoreStatsRemote(): Promise<ResponseStoreStats> {
  return request<ResponseStoreStats>("/stats");
}

export async function getRetentionPolicyRemote(): Promise<ResponseRetentionPolicy> {
  return request<ResponseRetentionPolicy>("/policy");
}

export async function setRetentionPolicyRemote(
  patch: Partial<ResponseRetentionPolicy>
): Promise<ResponseRetentionPolicy> {
  return request<ResponseRetentionPolicy>("/policy", {
    method: "POST",
    body: JSON.stringify(patch),
  });
}
