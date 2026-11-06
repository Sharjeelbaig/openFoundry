// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { ensureMachineKey } from "../directory/bootstrap";
import { getConnection, getConnectionSecret, patchConnectionSecret } from "./store";

/**
 * Google Drive with a bring-your-own OAuth client.
 *
 * The client ID and secret are supplied by the operator, so openFoundry never
 * ships or proxies a vendor credential. Only `drive.readonly` is requested.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE = "https://www.googleapis.com/drive/v3";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export interface OAuthState {
  connectionId: string;
  verifier: string;
  redirectUri: string;
  exp: number;
  nonce: string;
}

async function stateKey(): Promise<Buffer> {
  const machine = await ensureMachineKey();
  return createHash("sha256").update(`openfoundry-google-oauth:${machine}`).digest();
}

/** Signs the OAuth state so the callback cannot be forged or replayed. */
export async function signState(state: OAuthState): Promise<string> {
  const body = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const mac = createHmac("sha256", await stateKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export async function verifyState(value: string): Promise<OAuthState | null> {
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", await stateKey()).update(body).digest("base64url");
  if (
    expected.length !== mac.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))
  ) {
    return null;
  }
  try {
    const state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    if (!state.connectionId || !state.verifier || Date.now() > state.exp) return null;
    return state;
  } catch {
    return null;
  }
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function redirectUriFor(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/connections/google/callback`;
}

/**
 * Builds the consent URL and stores the PKCE verifier with the connection.
 * The verifier never appears in the URL; only its hash does.
 */
export async function buildAuthUrl(
  connectionId: string,
  origin: string
): Promise<string> {
  const connection = await getConnection(connectionId);
  if (!connection) throw new Error("Connection not found.");
  const clientId = String(connection.config.clientId || "");
  if (!clientId) throw new Error("The connection has no Google client ID.");
  const secret = await getConnectionSecret(connectionId);
  if (!secret.clientSecret) throw new Error("The connection has no Google client secret.");

  const { verifier, challenge } = pkcePair();
  const redirectUri = redirectUriFor(origin);
  const state = await signState({
    connectionId,
    verifier,
    redirectUri,
    exp: Date.now() + 10 * 60 * 1000,
    nonce: base64url(randomBytes(12)),
  });
  await patchConnectionSecret(connectionId, {
    pendingVerifier: verifier,
    pendingRedirect: redirectUri,
    pendingExp: Date.now() + 10 * 60 * 1000,
  });

  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(
      `Google token exchange failed: ${json.error_description || json.error || res.status}`
    );
  }
  return json;
}

/** Exchanges the authorization code and stores the refresh token. */
export async function exchangeCode(connectionId: string, code: string): Promise<void> {
  const connection = await getConnection(connectionId);
  if (!connection) throw new Error("Connection not found.");
  const secret = await getConnectionSecret(connectionId);
  const clientId = String(connection.config.clientId || "");
  const clientSecret = String(secret.clientSecret || "");
  const verifier = String(secret.pendingVerifier || "");
  const redirectUri = String(secret.pendingRedirect || "");
  if (!clientId || !clientSecret || !verifier || !redirectUri) {
    throw new Error("This connection has no pending authorization. Start the connect flow again.");
  }
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (!tokens.access_token) throw new Error("Google returned no access token.");
  if (!tokens.refresh_token) {
    throw new Error(
      "Google returned no refresh token. Remove the app's access at myaccount.google.com/permissions and connect again."
    );
  }
  await patchConnectionSecret(connectionId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    pendingVerifier: undefined,
    pendingRedirect: undefined,
    pendingExp: undefined,
  });
}

/** Returns a live access token, refreshing it when needed. */
export async function accessToken(connectionId: string): Promise<string> {
  const connection = await getConnection(connectionId);
  if (!connection) throw new Error("Connection not found.");
  const secret = await getConnectionSecret(connectionId);
  const current = String(secret.accessToken || "");
  const expiresAt = Number(secret.expiresAt || 0);
  if (current && expiresAt > Date.now() + 60_000) return current;

  const refreshToken = String(secret.refreshToken || "");
  if (!refreshToken) {
    throw new Error(
      "Google Drive is not connected yet. Open Connections, edit this connection and click Connect."
    );
  }
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: String(connection.config.clientId || ""),
    client_secret: String(secret.clientSecret || ""),
  });
  if (!tokens.access_token) throw new Error("Google returned no access token.");
  await patchConnectionSecret(connectionId, {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
  });
  return tokens.access_token;
}

export function driveQuery(folderId?: string): string {
  const parent = (folderId || "root").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(parent)) {
    throw new Error("The Drive folder ID is not valid. Use the ID from the folder URL.");
  }
  return `'${parent}' in parents and trashed = false`;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

export async function listDriveFiles(
  token: string,
  query: string,
  pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const url = new URL(`${DRIVE}/files`);
  url.searchParams.set("q", query);
  url.searchParams.set("pageSize", "200");
  url.searchParams.set(
    "fields",
    "files(id,name,mimeType,size,modifiedTime),nextPageToken"
  );
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    files?: DriveFile[];
    nextPageToken?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(`Drive list failed with ${res.status}: ${json.error?.message || ""}`);
  }
  return { files: json.files || [], nextPageToken: json.nextPageToken };
}

export async function downloadDriveFile(token: string, id: string): Promise<Buffer> {
  const res = await fetch(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Drive download failed with ${res.status}.`);
  return Buffer.from(await res.arrayBuffer());
}

/** Google Docs/Sheets/Slides have no bytes; they are exported instead. */
export function exportMime(mime: string): string | null {
  if (mime === "application/vnd.google-apps.document") return "text/plain";
  if (mime === "application/vnd.google-apps.spreadsheet") return "text/csv";
  if (mime === "application/vnd.google-apps.presentation") return "text/plain";
  return null;
}

export async function exportDriveFile(
  token: string,
  id: string,
  mime: string
): Promise<string> {
  const url = `${DRIVE}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mime)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Drive export failed with ${res.status}.`);
  return res.text();
}
