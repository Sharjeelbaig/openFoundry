// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash, randomBytes } from "crypto";
import catalog from "@/data/tool-catalog.json";
import setups from "@/data/tool-setup.json";
import {
  getOAuthPending,
  getOAuthTokens,
  saveOAuthPending,
  saveOAuthTokens,
} from "./store";
import {
  OAuthPending,
  OAuthTokenRecord,
  ToolCatalogEntry,
  ToolSetup,
  ToolSetupAuthMethod,
} from "./types";

const entries = catalog as ToolCatalogEntry[];
const setupMap = setups as Record<string, ToolSetup>;
const PENDING_TTL_MS = 10 * 60 * 1000;

export interface OAuthMethod {
  entry: ToolCatalogEntry;
  method: ToolSetupAuthMethod;
}

export function findOAuthMethod(
  toolId: string,
  authMethodId: string
): OAuthMethod {
  const entry = entries.find((item) => item.id === toolId);
  const setup = setupMap[toolId];
  const method = setup?.authMethods.find((item) => item.id === authMethodId);
  if (!entry) throw new Error("Tool not found.");
  if (!method) throw new Error("Authentication method not found.");
  if (
    method.type !== "oauth2" ||
    !method.oauth?.authorizationUrl ||
    !method.oauth.tokenUrl
  )
    throw new Error(
      "This tool does not publish an OAuth authorization and token URL."
    );
  return { entry, method };
}

export function oauthReference(toolId: string, authMethodId: string): string {
  return `oauth:${encodeURIComponent(toolId)}|${encodeURIComponent(
    authMethodId
  )}`;
}

export function parseOAuthReference(
  value: string
): { toolId: string; authMethodId: string } | null {
  const match = value.match(/^(?:Bearer\s+)?oauth:(.+)$/i);
  if (!match) return null;
  const parts = match[1].split("|");
  if (parts.length !== 2) return null;
  try {
    return {
      toolId: decodeURIComponent(parts[0]),
      authMethodId: decodeURIComponent(parts[1]),
    };
  } catch {
    return null;
  }
}

function providerExtras(authorizationUrl: string): Record<string, string> {
  const extras: Record<string, string> = {};
  if (authorizationUrl.includes("atlassian.com")) {
    extras.audience = "api.atlassian.com";
    extras.prompt = "consent";
  }
  if (authorizationUrl.includes("google.com")) {
    extras.access_type = "offline";
    extras.prompt = "consent";
  }
  return extras;
}

export async function createOAuthStart(input: {
  toolId: string;
  authMethodId: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string[];
  origin: string;
  extraAuthParams?: Record<string, string>;
}): Promise<{ authorizeUrl: string; redirectUri: string; state: string }> {
  const { entry, method } = findOAuthMethod(input.toolId, input.authMethodId);
  const oauth = method.oauth!;
  const clientId = input.clientId.trim();
  if (!clientId)
    throw new Error(
      "Enter the OAuth Client ID from your own provider application."
    );

  const scopes = (input.scopes?.length ? input.scopes : oauth.scopes || [])
    .map((scope) => scope.trim())
    .filter(Boolean);
  const redirectUri = `${input.origin.replace(/\/+$/, "")}/api/oauth/callback`;
  const state = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const url = new URL(oauth.authorizationUrl!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (scopes.length) url.searchParams.set("scope", scopes.join(" "));
  const extras = {
    ...providerExtras(oauth.authorizationUrl!),
    ...(input.extraAuthParams || {}),
  };
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const now = new Date();
  const pending: OAuthPending = {
    state,
    toolId: input.toolId,
    authMethodId: input.authMethodId,
    toolName: entry.name,
    authorizationUrl: oauth.authorizationUrl!,
    tokenUrl: oauth.tokenUrl!,
    clientId,
    clientSecret: input.clientSecret?.trim() || undefined,
    codeVerifier,
    redirectUri,
    scopes,
    extraAuthParams: extras,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS).toISOString(),
  };
  const pendingList = (await getOAuthPending()).filter(
    (item) => new Date(item.expiresAt).getTime() > Date.now()
  );
  pendingList.push(pending);
  await saveOAuthPending(pendingList);
  return { authorizeUrl: url.toString(), redirectUri, state };
}

export async function takeOAuthPending(
  state: string
): Promise<OAuthPending | null> {
  const pending = await getOAuthPending();
  const found = pending.find((item) => item.state === state);
  if (!found) return null;
  await saveOAuthPending(pending.filter((item) => item.state !== state));
  if (new Date(found.expiresAt).getTime() <= Date.now()) return null;
  return found;
}

async function postToken(
  tokenUrl: string,
  body: URLSearchParams
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `Could not reach the OAuth token endpoint: ${
        error instanceof Error ? error.message : "network error"
      }`
    );
  }
  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = Object.fromEntries(new URLSearchParams(text));
  }
  if (!response.ok || typeof data.access_token !== "string") {
    const message =
      (typeof data.error_description === "string" && data.error_description) ||
      (typeof data.error === "string" && data.error) ||
      `Token endpoint returned ${response.status}.`;
    throw new Error(message);
  }
  return data;
}

function tokenExpiry(data: Record<string, unknown>): string | undefined {
  const expiresIn = Number(data.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return undefined;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function tokenRecord(
  pending: OAuthPending,
  data: Record<string, unknown>
): OAuthTokenRecord {
  return {
    toolId: pending.toolId,
    authMethodId: pending.authMethodId,
    accessToken: String(data.access_token),
    refreshToken:
      typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    tokenType:
      typeof data.token_type === "string" ? data.token_type : "Bearer",
    scope: typeof data.scope === "string" ? data.scope : undefined,
    expiresAt: tokenExpiry(data),
    clientId: pending.clientId,
    clientSecret: pending.clientSecret,
    tokenUrl: pending.tokenUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function exchangeOAuthCode(
  pending: OAuthPending,
  code: string
): Promise<OAuthTokenRecord> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
    code_verifier: pending.codeVerifier,
  });
  if (pending.clientSecret) body.set("client_secret", pending.clientSecret);
  const data = await postToken(pending.tokenUrl, body);
  const record = tokenRecord(pending, data);
  const tokens = (await getOAuthTokens()).filter(
    (item) =>
      !(
        item.toolId === record.toolId &&
        item.authMethodId === record.authMethodId
      )
  );
  tokens.push(record);
  await saveOAuthTokens(tokens);
  return record;
}

async function refreshRecord(
  record: OAuthTokenRecord
): Promise<OAuthTokenRecord> {
  if (!record.refreshToken)
    throw new Error("The OAuth token expired and no refresh token was issued.");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: record.refreshToken,
    client_id: record.clientId,
  });
  if (record.clientSecret) body.set("client_secret", record.clientSecret);
  const data = await postToken(record.tokenUrl, body);
  const updated: OAuthTokenRecord = {
    ...record,
    accessToken: String(data.access_token),
    refreshToken:
      typeof data.refresh_token === "string"
        ? data.refresh_token
        : record.refreshToken,
    tokenType:
      typeof data.token_type === "string" ? data.token_type : record.tokenType,
    scope: typeof data.scope === "string" ? data.scope : record.scope,
    expiresAt: tokenExpiry(data) || record.expiresAt,
    updatedAt: new Date().toISOString(),
  };
  const tokens = await getOAuthTokens();
  const index = tokens.findIndex(
    (item) =>
      item.toolId === updated.toolId &&
      item.authMethodId === updated.authMethodId
  );
  if (index >= 0) tokens[index] = updated;
  else tokens.push(updated);
  await saveOAuthTokens(tokens);
  return updated;
}

export async function getOAuthAccessToken(
  toolId: string,
  authMethodId: string
): Promise<OAuthTokenRecord> {
  const record = (await getOAuthTokens()).find(
    (item) =>
      item.toolId === toolId && item.authMethodId === authMethodId
  );
  if (!record)
    throw new Error(
      "No OAuth token is stored for this tool. Open the tool setup and connect with OAuth first."
    );
  if (
    record.expiresAt &&
    new Date(record.expiresAt).getTime() <= Date.now() + 30_000
  ) {
    return refreshRecord(record);
  }
  return record;
}

export async function oauthStatus(
  toolId: string,
  authMethodId: string
): Promise<{
  connected: boolean;
  reference: string | null;
  expiresAt?: string;
  scope?: string;
  hasRefreshToken?: boolean;
}> {
  const record = (await getOAuthTokens()).find(
    (item) =>
      item.toolId === toolId && item.authMethodId === authMethodId
  );
  if (!record) return { connected: false, reference: null };
  return {
    connected: true,
    reference: oauthReference(toolId, authMethodId),
    expiresAt: record.expiresAt,
    scope: record.scope,
    hasRefreshToken: Boolean(record.refreshToken),
  };
}

/**
 * Replace `oauth:<encoded tool>|<encoded method>` placeholders in headers with
 * a current access token. Tokens are refreshed lazily, so stored MCP servers
 * and HTTP tools survive access-token expiry without copying the secret.
 */
export async function resolveOAuthHeaders(
  headers: Record<string, string>
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const parsed = parseOAuthReference(value);
    if (!parsed) {
      resolved[key] = value;
      continue;
    }
    const record = await getOAuthAccessToken(
      parsed.toolId,
      parsed.authMethodId
    );
    const hadBearer = /^Bearer\s+/i.test(value);
    resolved[key] = hadBearer
      ? `Bearer ${record.accessToken}`
      : record.accessToken;
  }
  return resolved;
}
