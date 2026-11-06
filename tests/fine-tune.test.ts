// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-finetune-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

type FineTune = typeof import("@/lib/fine-tune");
let fineTune: FineTune;

beforeAll(async () => {
  fineTune = await import("@/lib/fine-tune");
});

beforeEach(() => {
  writeFileSync(path.join(dir, "fine-tune.json"), "[]");
});

const rows = [
  {
    messages: [
      { role: "user", content: "What is the door code?" },
      { role: "assistant", content: "7781." },
    ],
  },
];

describe("fine-tune datasets", () => {
  it("persists a dataset and lists it", async () => {
    const created = await fineTune.createDataset({
      name: "door-codes",
      source: "custom",
      rows,
    });
    expect(created.rowCount).toBe(1);
    expect(created.characters).toBeGreaterThan(0);
    const list = await fineTune.listDatasets();
    expect(list.map((item) => item.name)).toEqual(["door-codes"]);
    await expect(fineTune.getDataset(created.id)).resolves.toMatchObject({
      name: "door-codes",
    });
  });

  it("exports one JSON object per line", async () => {
    const created = await fineTune.createDataset({
      name: "two-rows",
      source: "traces",
      rows: [
        ...rows,
        {
          messages: [
            { role: "user", content: "Second?" },
            { role: "assistant", content: "Yes." },
          ],
        },
      ],
    });
    const jsonl = fineTune.toJsonl(created);
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).messages[0].role).toBe("user");
    expect(JSON.parse(lines[1]).messages[1].content).toBe("Yes.");
  });

  it("rejects an invalid role and empty content", async () => {
    await expect(
      fineTune.createDataset({
        name: "bad-role",
        source: "custom",
        rows: [{ messages: [{ role: "tool", content: "x" }] }],
      })
    ).rejects.toThrow(/role must be/i);
    await expect(
      fineTune.createDataset({
        name: "empty",
        source: "custom",
        rows: [{ messages: [{ role: "user", content: "  " }] }],
      })
    ).rejects.toThrow(/non-empty/i);
  });

  it("rejects an empty dataset and a duplicate name", async () => {
    await expect(
      fineTune.createDataset({ name: "empty", source: "custom", rows: [] })
    ).rejects.toThrow(/at least one row/i);
    await fineTune.createDataset({ name: "dup", source: "custom", rows });
    await expect(
      fineTune.createDataset({ name: "DUP", source: "custom", rows })
    ).rejects.toThrow(/already exists/i);
  });

  it("deletes a dataset", async () => {
    const created = await fineTune.createDataset({
      name: "delete-me",
      source: "agents",
      rows,
    });
    await fineTune.deleteDataset(created.id);
    await expect(fineTune.getDataset(created.id)).resolves.toBeNull();
  });
});
