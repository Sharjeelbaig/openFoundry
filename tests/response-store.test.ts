// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import type { ConversationItem } from "@/lib/conversations";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-response-store-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

type Store = typeof import("@/lib/response-store");
let store: Store;

beforeAll(async () => {
  store = await import("@/lib/response-store");
});

const items: ConversationItem[] = [
  {
    id: "m1",
    object: "conversation.item",
    type: "message",
    created_at: 1,
    status: "completed",
    role: "user",
    content: [{ type: "input_text", text: "remember the vault code" }],
  },
  {
    id: "fc1",
    object: "conversation.item",
    type: "function_call",
    created_at: 2,
    status: "completed",
    call_id: "call_1",
    name: "lookup_code",
    arguments: '{"name":"vault"}',
  },
];

describe("cross-process response history", () => {
  it("survives reopening the SQLite store", async () => {
    await store.saveResponseHistory("resp_test", items);
    expect(existsSync(path.join(dir, "responses.db"))).toBe(true);

    // Drop the process-local connection and reopen from disk, as a fresh
    // server process would.
    store.closeResponseStore();

    const loaded = await store.loadResponseHistory("resp_test");
    expect(loaded?.items).toEqual(items);
  });

  it("returns null for an unknown response id", async () => {
    expect(await store.loadResponseHistory("resp_missing")).toBeNull();
  });
});

describe("response retention and tenancy", () => {
  it("scopes history to its owner", async () => {
    await store.saveResponseHistory("resp_owner_a", items, "user_a");
    await store.saveResponseHistory("resp_owner_b", items, "user_b");
    expect((await store.loadResponseHistory("resp_owner_a", "user_a"))?.items).toEqual(
      items
    );
    expect(await store.loadResponseHistory("resp_owner_a", "user_b")).toBeNull();
  });

  it("prunes by per-owner count and exposes stats", async () => {
    const previous = await store.getRetentionPolicy();
    try {
      await store.setRetentionPolicy({ maxResponsesPerOwner: 2, ttlDays: 0 });
      for (const id of ["resp_c1", "resp_c2", "resp_c3"]) {
        await store.saveResponseHistory(id, items, "tenant_c");
      }
      const stats = await store.responseStoreStats();
      expect(
        stats.owners.find((owner) => owner.ownerId === "tenant_c")?.count
      ).toBe(2);
      expect(await store.loadResponseHistory("resp_c1", "tenant_c")).toBeNull();
      expect(await store.loadResponseHistory("resp_c3", "tenant_c")).not.toBeNull();
    } finally {
      await store.setRetentionPolicy(previous);
    }
  });

  it("stores the retention policy in SQLite for every process", async () => {
    await store.setRetentionPolicy({ maxResponsesPerOwner: 42, ttlDays: 3 });
    store.closeResponseStore();
    expect(await store.getRetentionPolicy()).toEqual({
      maxResponsesPerOwner: 42,
      ttlDays: 3,
    });
    expect(existsSync(path.join(dir, "response-retention.json"))).toBe(false);

    // A second independent connection sees the same shared row.
    const db = new DatabaseSync(path.join(dir, "responses.db"));
    const row = db
      .prepare(
        "SELECT max_responses_per_owner, ttl_days FROM response_policy WHERE tenant_id = 'default'"
      )
      .get() as { max_responses_per_owner: number; ttl_days: number };
    db.close();
    expect(row).toMatchObject({ max_responses_per_owner: 42, ttl_days: 3 });
    await store.setRetentionPolicy({ maxResponsesPerOwner: 200, ttlDays: 7 });
  });

  it("prunes responses older than the TTL", async () => {
    const previous = await store.getRetentionPolicy();
    try {
      await store.saveResponseHistory("resp_old", items, "tenant_ttl");
      const db = new DatabaseSync(path.join(dir, "responses.db"));
      db.prepare("UPDATE responses SET created_at = ? WHERE id = ?").run(
        "2020-01-01T00:00:00.000Z",
        "resp_old"
      );
      db.close();
      await store.setRetentionPolicy({ maxResponsesPerOwner: 200, ttlDays: 1 });
      expect(await store.loadResponseHistory("resp_old", "tenant_ttl")).toBeNull();
    } finally {
      await store.setRetentionPolicy(previous);
    }
  });
});
