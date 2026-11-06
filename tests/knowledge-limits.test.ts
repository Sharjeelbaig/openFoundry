// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-knowledge-limits-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;
writeFileSync(path.join(dir, "deployments.json"), "[]");

type Service = typeof import("@/lib/knowledge/service");
let service: Service;

beforeAll(async () => {
  service = await import("@/lib/knowledge/service");
});

describe("knowledge limits", () => {
  it("caps a base at 10 sources", async () => {
    const base = await service.createBase({ name: "ten-sources" });
    for (let index = 0; index < 10; index += 1) {
      await service.addSource({
        baseId: base.id,
        kind: "folder",
        name: `source-${index}`,
        config: { path: `/tmp/folder-${index}` },
      });
    }
    await expect(
      service.addSource({
        baseId: base.id,
        kind: "folder",
        name: "source-11",
        config: { path: "/tmp/folder-11" },
      })
    ).rejects.toThrow(/at most 10/i);
  });

  it("caps a single upload at 200 files", async () => {
    const base = await service.createBase({ name: "upload-count" });
    const files = Array.from({ length: 201 }, (_, index) => ({
      name: `file-${index}.txt`,
      mime: "text/plain",
      buffer: Buffer.from("x"),
    }));
    await expect(service.ingestUploads(base.id, files)).rejects.toThrow(/at most 200/i);
  });

  it("rejects a file over 50 MB", async () => {
    const base = await service.createBase({ name: "upload-size" });
    await expect(
      service.ingestUploads(base.id, [
        {
          name: "huge.txt",
          mime: "text/plain",
          buffer: Buffer.alloc(50 * 1024 * 1024 + 1),
        },
      ])
    ).rejects.toThrow(/larger than 50 MB/i);
  });
});
