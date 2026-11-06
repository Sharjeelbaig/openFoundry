// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { createHash } from "crypto";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-google-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

type Google = typeof import("@/lib/connections/google");
type Store = typeof import("@/lib/connections/store");

let google: Google;
let store: Store;

beforeAll(async () => {
  google = await import("@/lib/connections/google");
  store = await import("@/lib/connections/store");
});

beforeEach(() => {
  writeFileSync(path.join(dir, "connections.json"), "[]");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function googleConnection() {
  return store.createConnection({
    name: "drive-test",
    provider: "google-drive",
    target: "",
    authType: "oauth2",
    config: { clientId: "client-123.apps.googleusercontent.com" },
    secret: { clientSecret: "client-secret" },
  });
}

describe("OAuth state", () => {
  it("round-trips and rejects tampering", async () => {
    const state = await google.signState({
      connectionId: "conn_1",
      verifier: "verifier-abc",
      redirectUri: "http://localhost:3000/api/connections/google/callback",
      exp: Date.now() + 60_000,
      nonce: "n1",
    });
    await expect(google.verifyState(state)).resolves.toMatchObject({
      connectionId: "conn_1",
      verifier: "verifier-abc",
    });

    const tampered = state.replace(/.$/, state.endsWith("A") ? "B" : "A");
    await expect(google.verifyState(tampered)).resolves.toBeNull();
  });

  it("rejects an expired state", async () => {
    const state = await google.signState({
      connectionId: "conn_1",
      verifier: "v",
      redirectUri: "http://localhost/cb",
      exp: Date.now() - 1000,
      nonce: "n",
    });
    await expect(google.verifyState(state)).resolves.toBeNull();
  });
});

describe("PKCE", () => {
  it("derives the challenge from the verifier", () => {
    const { verifier, challenge } = google.pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(
      createHash("sha256").update(verifier).digest("base64url")
    );
    expect(challenge).not.toBe(verifier);
  });
});

describe("consent URL", () => {
  it("contains the required parameters and no client secret", async () => {
    const connection = await googleConnection();
    const url = new URL(
      await google.buildAuthUrl(connection.id, "http://localhost:3000")
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe(
      "client-123.apps.googleusercontent.com"
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/connections/google/callback"
    );
    expect(url.searchParams.get("scope")).toBe(google.DRIVE_SCOPE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.toString()).not.toContain("client-secret");
  });
});

describe("Drive query", () => {
  it("scopes to a folder and excludes trash", () => {
    expect(google.driveQuery("abc_123")).toBe(
      "'abc_123' in parents and trashed = false"
    );
    expect(google.driveQuery()).toBe("'root' in parents and trashed = false");
  });

  it("rejects a folder id with quotes", () => {
    expect(() => google.driveQuery("x' or true")).toThrow(/not valid/i);
  });
});

describe("Google Docs export", () => {
  it("maps the three Google app types and nothing else", () => {
    expect(google.exportMime("application/vnd.google-apps.document")).toBe("text/plain");
    expect(google.exportMime("application/vnd.google-apps.spreadsheet")).toBe("text/csv");
    expect(google.exportMime("application/vnd.google-apps.presentation")).toBe("text/plain");
    expect(google.exportMime("text/plain")).toBeNull();
  });
});

describe("token refresh", () => {
  it("stores the refreshed token and reuses it", async () => {
    const connection = await googleConnection();
    await store.patchConnectionSecret(connection.id, {
      refreshToken: "refresh-1",
      expiresAt: 0,
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "access-1", expires_in: 3600 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(google.accessToken(connection.id)).resolves.toBe("access-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      { body?: string },
    ];
    const body = String(call[1]?.body || "");
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=refresh-1");

    // Second call uses the cached access token, not another refresh.
    await expect(google.accessToken(connection.id)).resolves.toBe("access-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explains that the connection is not connected yet", async () => {
    const connection = await googleConnection();
    await expect(google.accessToken(connection.id)).rejects.toThrow(/not connected/i);
  });
});
