// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { getConnection, getConnectionSecret } from "./store";
import { accessToken } from "./google";

/**
 * Merges a connection's endpoint and decrypted secret into a source config.
 *
 * Sources store only what is specific to them (bucket, container, prefix). The
 * credential lives on the connection, so rotating it updates every source that
 * uses it.
 */
export async function resolveSourceConfig(source: {
  config: Record<string, unknown>;
  connectionId?: string | null;
}): Promise<Record<string, unknown>> {
  if (!source.connectionId) return source.config;
  const connection = await getConnection(source.connectionId);
  if (!connection) {
    throw new Error(
      "The connection this source used no longer exists. Edit the source and choose another connection."
    );
  }
  const secret = await getConnectionSecret(connection.id);

  if (connection.provider === "s3") {
    return {
      ...source.config,
      endpoint: connection.target,
      region: connection.config.region || "us-east-1",
      accessKeyId: secret.accessKeyId,
      secretAccessKey: secret.secretAccessKey,
      sessionToken: secret.sessionToken,
    };
  }

  if (connection.provider === "azure-blob") {
    return {
      ...source.config,
      endpoint: connection.target,
      sas: secret.sas,
    };
  }

  if (connection.provider === "azure-ai-search") {
    return {
      ...source.config,
      target: connection.target,
      apiKey: secret.apiKey,
      apiVersion: connection.config.apiVersion || "2024-07-01",
    };
  }

  if (connection.provider === "google-drive") {
    return {
      ...source.config,
      accessToken: await accessToken(connection.id),
    };
  }

  if (connection.provider === "webdav") {
    return {
      ...source.config,
      target: connection.target,
      username: secret.username,
      password: secret.password,
    };
  }

  return source.config;
}

/** True when a source kind can only work through a connection. */
export const CONNECTION_KINDS = new Set([
  "s3",
  "azure-blob",
  "azure-ai-search",
  "webdav",
  "google-drive",
]);

export function kindMatchesProvider(kind: string, provider: string): boolean {
  return kind === provider;
}
