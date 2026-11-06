// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { AddressInfo } from "net";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-images-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";

type Images = typeof import("@/lib/images");
let images: Images;
let server: Server;
let baseUrl = "";

function writeSettings(overrides: Record<string, unknown>) {
  writeFileSync(
    path.join(dir, "settings.json"),
    JSON.stringify({
      imageProvider: "auto",
      imageUrl: "",
      imageApiKey: "",
      imageModel: "",
      ...overrides,
    })
  );
}

beforeAll(async () => {
  images = await import("@/lib/images");
  server = createServer((req, res) => {
    const url = req.url || "";
    res.setHeader("content-type", "application/json");
    if (url === "/sdapi/v1/sd-models") {
      res.end(JSON.stringify([{ title: "stub-sd" }]));
      return;
    }
    if (url === "/sdapi/v1/txt2img") {
      res.end(JSON.stringify({ images: [PNG], info: JSON.stringify({ seed: 1234 }) }));
      return;
    }
    if (url === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "stub-image" }] }));
      return;
    }
    if (url === "/v1/images/generations") {
      res.end(JSON.stringify({ data: [{ b64_json: PNG }], seed: 99 }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  writeSettings({ imageProvider: "automatic1111", imageUrl: baseUrl });
});

describe("image runtime", () => {
  it("probes AUTOMATIC1111 and lists its models", async () => {
    const status = await images.imageStatus();
    expect(status.available).toBe(true);
    expect(status.kind).toBe("automatic1111");
    expect(status.models).toEqual(["stub-sd"]);
  });

  it("generates through the AUTOMATIC1111 protocol", async () => {
    const image = await images.generateImage({ prompt: "a red cube", width: 64, height: 64 });
    expect(image.provider).toBe("automatic1111");
    expect(image.mime).toBe("image/png");
    expect(image.seed).toBe(1234);
    expect(image.buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("probes and generates through the OpenAI protocol", async () => {
    writeSettings({ imageProvider: "openai", imageUrl: baseUrl, imageModel: "stub-image" });
    const status = await images.imageStatus();
    expect(status.kind).toBe("openai");
    expect(status.models).toEqual(["stub-image"]);

    const image = await images.generateImage({ prompt: "a blue cube" });
    expect(image.provider).toBe("openai");
    expect(image.model).toBe("stub-image");
    expect(image.seed).toBe(99);
    expect(image.buffer.byteLength).toBeGreaterThan(0);
  });

  it("reports a clear failure when no runtime answers", async () => {
    writeSettings({ imageProvider: "automatic1111", imageUrl: "http://127.0.0.1:9" });
    const status = await images.imageStatus();
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/No image runtime answered/i);
    await expect(images.generateImage({ prompt: "x" })).rejects.toThrow(
      /No image runtime produced an image/i
    );
  });

  it("rejects an empty prompt", async () => {
    await expect(images.generateImage({ prompt: "  " })).rejects.toThrow(/prompt is required/i);
  });
});
