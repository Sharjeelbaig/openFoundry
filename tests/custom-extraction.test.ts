// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-extraction-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;
writeFileSync(
  path.join(dir, "deployments.json"),
  JSON.stringify([
    {
      id: "dep_test",
      name: "test-deploy",
      modelId: "test:1",
      modelName: "Test",
      provider: "ollama",
      status: "Running",
    },
  ])
);

vi.mock("@/lib/chat", () => ({
  completeChat: vi.fn(
    async (options: { messages: { role: string; content: string }[] }) => {
      const prompt = options.messages[1]?.content || "";
      const user = prompt.slice(prompt.lastIndexOf("DOCUMENT"));
      let text = "{}";
      if (user.includes("BROKEN")) {
        text = "I could not read that document.";
      } else if (user.includes("INV-1001")) {
        text = JSON.stringify({
          vendor: "Contoso Ltd.",
          invoice: "INV-1001",
          total: "$1,250.00",
        });
      } else if (user.includes("INV-1002")) {
        text = JSON.stringify({
          vendor: "Fabrikam",
          invoice: "INV-1002",
          total: 980.5,
        });
      } else if (user.includes("INV-2001")) {
        text = JSON.stringify({
          vendor: "Northwind",
          invoice: "INV-2001",
          total: 440,
        });
      } else if (user.includes("INV-3001")) {
        text = JSON.stringify({ vendor: null, invoice: "INV-3001", total: 100 });
      }
      return {
        text,
        promptTokens: 10,
        completionTokens: 5,
        toolCalls: [],
      };
    }
  ),
}));

type Extraction = typeof import("@/lib/extraction");
let extraction: Extraction;

beforeAll(async () => {
  extraction = await import("@/lib/extraction");
});

async function seedModel() {
  const model = await extraction.createExtractionModel({
    name: `invoice-${Math.random().toString(36).slice(2, 7)}`,
    description: "Extract invoice header fields",
    fields: [
      { name: "vendor", type: "string", required: true },
      { name: "invoice", type: "string", required: true },
      { name: "total", type: "number", required: true },
    ],
  });
  await extraction.addExtractionExample(model.id, {
    text: "Vendor: Contoso Ltd.\nInvoice: INV-1001\nTotal: $1,250.00",
    expected: {
      vendor: "Contoso Ltd.",
      invoice: "INV-1001",
      total: 1250,
    },
  });
  await extraction.addExtractionExample(model.id, {
    text: "Vendor: Fabrikam\nInvoice: INV-1002\nTotal: 980.50",
    expected: {
      vendor: "Fabrikam",
      invoice: "INV-1002",
      total: 980.5,
    },
  });
  return model;
}

describe("custom document extraction models", () => {
  it("trains with leave-one-out metrics and extracts typed fields", async () => {
    const model = await seedModel();
    const trained = await extraction.trainExtractionModel(model.id);
    expect(trained.status).toBe("ready");
    expect(trained.metrics).toMatchObject({
      examples: 2,
      fields: 6,
      matched: 6,
      accuracy: 1,
    });
    expect(trained.neural?.fields.vendor).toBeTruthy();
    expect(trained.neural?.fields.invoice).toBeTruthy();
    expect(trained.neural?.fields.total).toBeTruthy();
    expect(trained.neural?.metrics?.checks).toBeGreaterThan(0);

    const neural = await extraction.extractWithNeuralModel(
      model.id,
      "Vendor: Northwind\nInvoice: INV-2001\nTotal: 440"
    );
    expect(neural.fields.vendor).toMatchObject({
      value: "Northwind",
      engine: "neural",
    });
    expect(neural.fields.invoice.value).toBe("INV-2001");
    expect(neural.fields.total.value).toBe(440);

    const result = await extraction.extractWithCustomModel(
      model.id,
      "Vendor: Northwind\nInvoice: INV-2001\nTotal: 440"
    );
    expect(result.fields.vendor.value).toBe("Northwind");
    expect(result.fields.invoice.value).toBe("INV-2001");
    expect(result.fields.total.value).toBe(440);
    expect(result.fields.total.confidence).toBeGreaterThan(0.9);
    expect(result.fields.total.grounded).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("reports missing fields and invalid model output honestly", async () => {
    const model = await seedModel();
    const missing = await extraction.extractWithCustomModel(
      model.id,
      "Invoice: INV-3001\nTotal: 100"
    );
    expect(missing.missing).toContain("vendor");
    expect(missing.fields.vendor.value).toBeNull();

    const broken = await extraction.extractWithCustomModel(
      model.id,
      "BROKEN document"
    );
    expect(broken.warnings.join(" ")).toMatch(/valid JSON/i);
    expect(broken.missing).toEqual(["vendor", "invoice", "total"]);
  });

  it("rejects duplicate fields and insufficient training examples", async () => {
    await expect(
      extraction.createExtractionModel({
        name: "duplicate-fields",
        fields: [
          { name: "vendor", type: "string" },
          { name: "vendor", type: "string" },
        ],
      })
    ).rejects.toThrow(/duplicated/i);

    const model = await extraction.createExtractionModel({
      name: `one-example-${Date.now()}`,
      fields: [{ name: "vendor", type: "string" }],
    });
    await extraction.addExtractionExample(model.id, {
      text: "Vendor: One",
      expected: { vendor: "One" },
    });
    await expect(extraction.trainExtractionModel(model.id)).rejects.toThrow(
      /two labeled examples/i
    );
  });
});
