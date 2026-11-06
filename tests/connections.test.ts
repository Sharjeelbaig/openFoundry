// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-connections-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

type Vault = typeof import("@/lib/connections/vault");
type Store = typeof import("@/lib/connections/store");
type Resolve = typeof import("@/lib/connections/resolve");

let vault: Vault;
let store: Store;
let resolve: Resolve;

beforeAll(async () => {
  vault = await import("@/lib/connections/vault");
  store = await import("@/lib/connections/store");
  resolve = await import("@/lib/connections/resolve");
});

beforeEach(() => {
  writeFileSync(path.join(dir, "connections.json"), "[]");
});

describe("secret vault", () => {
  it("round-trips a secret", async () => {
    const sealed = await vault.seal({ accessKeyId: "AKIA123", secret: "top-secret" });
    expect(sealed).not.toContain("top-secret");
    await expect(vault.unseal(sealed)).resolves.toEqual({
      accessKeyId: "AKIA123",
      secret: "top-secret",
    });
  });

  it("rejects a tampered ciphertext", async () => {
    const sealed = await vault.seal({ apiKey: "abc" });
    const raw = Buffer.from(sealed, "base64");
    raw[raw.length - 1] ^= 0xff;
    await expect(vault.unseal(raw.toString("base64"))).rejects.toThrow(
      /could not be decrypted|malformed/i
    );
  });

  it("masks the last four characters", () => {
    expect(vault.secretHint({ apiKey: "0123456789" })).toBe("••••6789");
  });
});

describe("connection store", () => {
  it("never returns the ciphertext or the secret", async () => {
    const created = await store.createConnection({
      name: "blob-prod",
      provider: "azure-blob",
      target: "https://acct.blob.core.windows.net/",
      authType: "sasToken",
      secret: { sas: "sv=2024&sig=abcdef" },
    });
    expect(created).not.toHaveProperty("secretCipher");
    expect(created.secretSet).toBe(true);
    expect(created.target).toBe("https://acct.blob.core.windows.net");
    expect(JSON.stringify(created)).not.toContain("abcdef");

    const stored = readFileSync(path.join(dir, "connections.json"), "utf8");
    expect(stored).toContain("secretCipher");
    expect(stored).not.toContain("abcdef");

    await expect(store.getConnectionSecret(created.id)).resolves.toEqual({
      sas: "sv=2024&sig=abcdef",
    });
  });

  it("keeps a connection untested until a test records a result", async () => {
    const created = await store.createConnection({
      name: "s3-dev",
      provider: "s3",
      target: "https://s3.us-east-1.amazonaws.com",
      authType: "accessKey",
      config: { region: "us-east-1" },
      secret: { accessKeyId: "AKIA", secretAccessKey: "secret" },
    });
    expect(created.status).toBe("unknown");

    const failed = await store.recordTest(created.id, {
      ok: false,
      detail: "403 from provider",
      latencyMs: 12,
    });
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toContain("403");

    const ok = await store.recordTest(created.id, {
      ok: true,
      detail: "accepted",
      latencyMs: 9,
    });
    expect(ok.status).toBe("ok");
    expect(ok.lastError).toBeUndefined();
  });

  it("rejects an unknown provider and a missing secret", async () => {
    await expect(
      store.createConnection({
        name: "bad",
        provider: "dropbox" as never,
        target: "https://example.com",
        authType: "apiKey",
      })
    ).rejects.toThrow(/provider/i);

    await expect(
      store.createConnection({
        name: "no-secret",
        provider: "azure-blob",
        target: "https://acct.blob.core.windows.net",
        authType: "sasToken",
        secret: {},
      })
    ).rejects.toThrow(/SAS token is required/i);
  });

  it("drops the old seeded fake connection", async () => {
    writeFileSync(
      path.join(dir, "connections.json"),
      JSON.stringify([
        {
          id: "connection-ai-search",
          name: "ai-search",
          kind: "Azure AI Search",
          target: "https://localhost.search.local",
          authType: "Local (no key required)",
          createdAt: "2026-10-31T18:54:53.156Z",
        },
      ])
    );
    await expect(store.listConnections()).resolves.toEqual([]);
    expect(readFileSync(path.join(dir, "connections.json"), "utf8")).toBe("[]");
  });

  it("migrates a real legacy Azure AI Search row without a secret", async () => {
    writeFileSync(
      path.join(dir, "connections.json"),
      JSON.stringify([
        {
          id: "connection-real",
          name: "search-prod",
          kind: "Azure AI Search",
          target: "https://my-service.search.windows.net/",
          authType: "API key",
          createdAt: "2026-10-31T18:54:53.156Z",
        },
      ])
    );
    const [connection] = await store.listConnections();
    expect(connection.provider).toBe("azure-ai-search");
    expect(connection.target).toBe("https://my-service.search.windows.net");
    expect(connection.secretSet).toBe(false);
  });
});

describe("source config resolution", () => {
  it("merges the S3 endpoint and secret into the source config", async () => {
    const created = await store.createConnection({
      name: "s3-shared",
      provider: "s3",
      target: "https://minio.local:9000",
      authType: "accessKey",
      config: { region: "eu-west-1" },
      secret: { accessKeyId: "AKIA", secretAccessKey: "shh" },
    });
    const merged = await resolve.resolveSourceConfig({
      config: { bucket: "docs", prefix: "policies/" },
      connectionId: created.id,
    });
    expect(merged).toMatchObject({
      bucket: "docs",
      prefix: "policies/",
      endpoint: "https://minio.local:9000",
      region: "eu-west-1",
      accessKeyId: "AKIA",
      secretAccessKey: "shh",
    });
  });

  it("leaves a connection-less source untouched", async () => {
    const config = { path: "/tmp/corpus" };
    await expect(
      resolve.resolveSourceConfig({ config, connectionId: null })
    ).resolves.toBe(config);
  });
});
