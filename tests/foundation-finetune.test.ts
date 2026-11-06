// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-foundation-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;
writeFileSync(path.join(dir, "deployments.json"), "[]");

type Extraction = typeof import("@/lib/extraction");
type Foundation = typeof import("@/lib/foundation-finetune");

let extraction: Extraction;
let foundation: Foundation;

beforeAll(async () => {
  extraction = await import("@/lib/extraction");
  foundation = await import("@/lib/foundation-finetune");
});

const EXAMPLES = [
  ["Contoso Ltd.", "INV-1001", 1250],
  ["Fabrikam", "INV-1002", 980.5],
  ["Northwind Traders", "INV-1003", 440],
  ["Adventure Works", "INV-1004", 3120.75],
  ["Tailspin Toys", "INV-1005", 88],
  ["Wingtip Press", "INV-1006", 610],
  ["Proseware", "INV-1007", 2499.99],
  ["Litware", "INV-1008", 75.25],
  ["Initech", "INV-1009", 199],
  ["Umbrella Group", "INV-1010", 845.5],
] as const;

async function seedModel(count = 8) {
  const model = await extraction.createExtractionModel({
    name: `foundation-${Math.random().toString(36).slice(2, 7)}`,
    description: "Invoice header extraction",
    fields: [
      { name: "vendor", type: "string", required: true },
      { name: "invoice", type: "string", required: true },
      { name: "total", type: "number", required: true },
    ],
  });
  for (const [vendor, invoice, total] of EXAMPLES.slice(0, count)) {
    await extraction.addExtractionExample(model.id, {
      text: `Vendor: ${vendor}\nInvoice: ${invoice}\nTotal: $${total}`,
      expected: { vendor, invoice, total },
    });
  }
  return (await extraction.getExtractionModel(model.id))!;
}

describe("foundation fine-tune dataset", () => {
  it("splits labelled examples into disjoint train, valid and test sets", async () => {
    const model = await seedModel(8);
    const dataset = foundation.buildFoundationDataset(model);
    expect(dataset.train).toHaveLength(5);
    expect(dataset.valid).toHaveLength(1);
    expect(dataset.test).toHaveLength(2);
    expect(dataset.train.length + dataset.valid.length + dataset.test.length).toBe(
      8
    );

    const trainText = new Set(
      dataset.train.map((item) => item.messages[1].content)
    );
    for (const heldOut of dataset.test) {
      expect(trainText.has(heldOut.messages[1].content)).toBe(false);
    }

    for (const item of [...dataset.train, ...dataset.valid, ...dataset.test]) {
      expect(item.messages[0].role).toBe("system");
      expect(item.messages[0].content).toContain("vendor");
      expect(item.messages[0].content).toContain("Return only one JSON object");
      expect(item.messages[1].role).toBe("user");
    }
    for (const item of [...dataset.train, ...dataset.valid]) {
      expect(item.messages[2].role).toBe("assistant");
      const expected = JSON.parse(item.messages[2].content) as Record<
        string,
        unknown
      >;
      expect(Object.keys(expected).sort()).toEqual([
        "invoice",
        "total",
        "vendor",
      ]);
    }
  });

  it("refuses a fine-tune with too few examples", async () => {
    const model = await seedModel(3);
    expect(() => foundation.buildFoundationDataset(model)).toThrow(
      /at least 6 labeled examples/i
    );
  });
});

describe("foundation held-out scoring", () => {
  it("compares base and tuned outputs per field", async () => {
    const model = await seedModel(6);
    const test = [
      {
        id: "case-1",
        messages: [],
        expected: { vendor: "A", invoice: "INV-1", total: 10 },
      },
      {
        id: "case-2",
        messages: [],
        expected: { vendor: "B", invoice: "INV-2", total: 20 },
      },
    ];
    const base = [
      {
        id: "case-1",
        text: '{"vendor":"A","invoice":"INV-1","total":11}',
      },
      {
        id: "case-2",
        text: '{"vendor":"B","invoice":"INV-2","total":20}',
      },
    ];
    const tuned = [
      {
        id: "case-1",
        text: '```json\n{"vendor":"A","invoice":"INV-1","total":10}\n```',
      },
      {
        id: "case-2",
        text: '{"vendor":"B","invoice":"INV-2","total":20}',
      },
    ];

    const metrics = foundation.scoreFoundationResults(
      model,
      test,
      base,
      tuned,
      "test-base",
      80
    );
    expect(metrics.checks).toBe(6);
    expect(metrics.baseCorrect).toBe(5);
    expect(metrics.tunedCorrect).toBe(6);
    expect(metrics.baseAccuracy).toBeCloseTo(5 / 6);
    expect(metrics.tunedAccuracy).toBe(1);
    expect(metrics.improvement).toBeCloseTo(1 / 6);
    const total = metrics.perField.find((item) => item.field === "total");
    expect(total).toMatchObject({ checks: 2, baseCorrect: 1, tunedCorrect: 2 });
  });

  it("parses fenced JSON and normalizes typed values", () => {
    expect(
      extraction.parseJsonObject('Here you go:\n```json\n{"total":"$1,250.00"}\n```')
    ).toEqual({ total: "$1,250.00" });
    expect(
      extraction.coerceFieldValue({ name: "total", type: "number" }, "$1,250.00")
    ).toBe(1250);
    expect(extraction.normalizeForCompare("number", "440")).toBe(440);
    expect(extraction.normalizeForCompare("string", " Contoso ")).toBe("contoso");
  });
});

describe("foundation cleanup", () => {
  it("removes the adapter, fused model and dataset when a model is deleted", async () => {
    const modelDir = path.join(dir, "foundation", "xmdl_cleanup");
    mkdirSync(path.join(modelDir, "data"), { recursive: true });
    writeFileSync(path.join(modelDir, "data", "train.jsonl"), "");
    expect(existsSync(modelDir)).toBe(true);
    await foundation.removeFoundationArtifacts("xmdl_cleanup");
    expect(existsSync(modelDir)).toBe(false);
  });
});

describe("foundation hyperparameter search", () => {
  it("builds one run by default and a distinct search grid when asked", () => {
    const single = foundation.buildCandidateSpecs({
      iterations: 50,
      learningRate: 2e-5,
      numLayers: 4,
    });
    expect(single).toEqual([
      { id: "single", learningRate: 2e-5, iterations: 50, numLayers: 4, rank: 8 },
    ]);

    const presets = foundation.buildCandidateSpecs({ search: true });
    expect(presets).toHaveLength(3);
    expect(new Set(presets.map((candidate) => candidate.id)).size).toBe(3);
    expect(presets.every((candidate) => candidate.rank === 8)).toBe(true);

    const custom = foundation.buildCandidateSpecs({
      search: true,
      candidates: [
        { id: "A", learningRate: 1e-5, iterations: 40, numLayers: 8 },
        { id: "a", learningRate: 2e-5, iterations: 40, numLayers: 16 },
      ],
    });
    expect(custom.map((candidate) => candidate.id)).toEqual(["a", "a-2"]);
    expect(custom.every((candidate) => candidate.rank === 8)).toBe(true);

    expect(() =>
      foundation.buildCandidateSpecs({
        search: true,
        candidates: Array.from({ length: 9 }, (_, index) => ({
          id: `candidate-${index}`,
        })),
      })
    ).toThrow(/at most 8/i);
  });

  it("picks the best successful candidate and breaks ties by duration", () => {
    const base = {
      learningRate: 1e-5,
      iterations: 40,
      numLayers: 8,
      rank: 8,
      checks: 5,
      adapterPath: "/tmp/adapter",
    };
    const candidates = [
      { ...base, id: "slow", tunedCorrect: 4, tunedAccuracy: 0.8, durationMs: 100 },
      { ...base, id: "fast", tunedCorrect: 4, tunedAccuracy: 0.8, durationMs: 50 },
      { ...base, id: "best", tunedCorrect: 5, tunedAccuracy: 1, durationMs: 200 },
      {
        ...base,
        id: "failed",
        tunedCorrect: 0,
        tunedAccuracy: 0,
        durationMs: 0,
        error: "boom",
      },
    ];
    expect(foundation.pickBestCandidate(candidates)?.id).toBe("best");
    expect(
      foundation.pickBestCandidate([candidates[0], candidates[1]])?.id
    ).toBe("fast");
    expect(
      foundation.pickBestCandidate([candidates[3]])
    ).toBeNull();
  });
});

describe("foundation hardware preflight", () => {
  const sevenB = "mlx-community/Qwen2.5-7B-Instruct-4bit";

  it("uses the stable 7B QLoRA defaults and lower-rate search presets", () => {
    const single = foundation.buildCandidateSpecs({ baseModel: sevenB });
    expect(single).toHaveLength(1);
    expect(single[0]).toMatchObject({
      learningRate: 5e-6,
      iterations: 40,
      numLayers: 8,
    });
    const presets = foundation.buildCandidateSpecs({
      baseModel: sevenB,
      search: true,
    });
    expect(presets).toHaveLength(3);
    expect(presets.every((preset) => preset.learningRate <= 5e-6)).toBe(true);
  });

  it("accepts the 7B 4-bit QLoRA path on 8 GB with 14 GB free", async () => {
    const info = foundation.FOUNDATION_BASE_MODELS.find(
      (model) => model.id === sevenB
    );
    expect(info).toMatchObject({
      quantized: true,
      bits: 4,
      validated: true,
    });
    const preflight = await foundation.foundationPreflight(sevenB, {
      freeDiskBytes: 14_000_000_000,
      totalMemoryBytes: 8_000_000_000,
    });
    expect(preflight.ok).toBe(true);
    expect(preflight.requiredDiskBytes).toBeGreaterThan(4_000_000_000);
    expect(preflight.requiredDiskBytes).toBeLessThan(7_000_000_000);
    expect(preflight.requiredMemoryBytes).toBeLessThanOrEqual(7_000_000_000);
    expect(preflight.fitsDisk).toBe(true);
    expect(preflight.fitsMemory).toBe(true);
  });

  it("refuses 7B bf16 on this 8 GB / 23 GB machine", async () => {
    const preflight = await foundation.foundationPreflight(
      "Qwen/Qwen2.5-7B-Instruct",
      {
        freeDiskBytes: 23_000_000_000,
        totalMemoryBytes: 8_000_000_000,
      }
    );
    expect(preflight.ok).toBe(false);
    expect(preflight.reason).toMatch(/disk|memory/i);
  });

  it("refuses the 7B path when disk or memory is short", async () => {
    const preflight = await foundation.foundationPreflight(sevenB, {
      freeDiskBytes: 5_000_000_000,
      totalMemoryBytes: 4_000_000_000,
    });
    expect(preflight.ok).toBe(false);
    expect(preflight.fitsDisk).toBe(false);
    expect(preflight.fitsMemory).toBe(false);
    expect(preflight.reason).toMatch(/disk/i);
    expect(preflight.reason).toMatch(/memory/i);
    await expect(
      foundation.assertFoundationFeasible(sevenB, {
        freeDiskBytes: 5_000_000_000,
        totalMemoryBytes: 4_000_000_000,
      })
    ).rejects.toThrow(/cannot run/i);
  });
});

describe("foundation runtime", () => {
  it("reports a real MLX availability state", async () => {
    const status = await foundation.foundationStatus(true);
    expect(typeof status.available).toBe("boolean");
    expect(status.baseModel).toContain("/");
    expect(status.installCommand).toContain("mlx-lm");
    expect(status.models.length).toBeGreaterThan(0);
    expect(status.preflight.baseModel).toBe(status.baseModel);
    if (status.available) {
      expect(status.python).toBeTruthy();
      expect(status.mlxLmVersion).toBeTruthy();
    } else {
      expect(status.reason).toBeTruthy();
    }
  }, 30_000);

  it("reuses an existing MLX runtime instead of reinstalling", async () => {
    const status = await foundation.foundationStatus(true);
    if (!status.available) {
      expect(status.reason).toBeTruthy();
      return;
    }
    const result = await foundation.installFoundationRuntime();
    expect(result.status.available).toBe(true);
    expect(result.log).toMatch(/already available/i);
  }, 30_000);

  it.skipIf(process.env.OPENFOUNDRY_RUN_FINETUNE !== "1")(
    "trains a local MLX LoRA adapter, evaluates held-out fields and extracts",
    async () => {
      const model = await seedModel(10);
      const result = await foundation.trainFoundationModel(model.id, {
        iterations: 80,
      });
      expect(result.model.foundation?.status).toBe("ready");
      expect(result.metrics.testExamples).toBeGreaterThan(0);
      expect(result.metrics.checks).toBeGreaterThan(0);
      expect(result.metrics.tunedAccuracy).toBeGreaterThanOrEqual(
        result.metrics.baseAccuracy
      );
      expect(existsSync(result.model.foundation?.modelPath || "")).toBe(true);

      const extracted = await foundation.extractWithFoundationModel(
        model.id,
        "Vendor: Initech\nInvoice: INV-9001\nTotal: 1234.50"
      );
      expect(extracted.fields.invoice.value).toBe("INV-9001");
      expect(extracted.fields.total.value).toBe(1234.5);
      expect(extracted.fields.invoice.engine).toBe("foundation");
    },
    900_000
  );
});
