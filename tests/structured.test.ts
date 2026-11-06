// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { extractBuffer, hasTesseract } from "@/lib/knowledge/extract";
import { extractStructured } from "@/lib/structured";

describe("structured extraction", () => {
  it("finds key/value pairs and a pipe table in text", () => {
    const document = extractStructured(
      [
        "Invoice summary",
        "Vendor: Contoso Ltd.",
        "Invoice: INV-4417",
        "Total: $1,250.00",
        "",
        "Line items",
        "| Item | Qty | Unit price | Total |",
        "| --- | ---: | ---: | ---: |",
        "| Foundry hosting | 2 | $500.00 | $1,000.00 |",
        "| Support | 1 | $250.00 | $250.00 |",
      ].join("\n"),
      "text"
    );

    expect(document.keyValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Vendor", value: "Contoso Ltd." }),
        expect.objectContaining({ key: "Invoice", value: "INV-4417" }),
        expect.objectContaining({ key: "Total", value: "$1,250.00" }),
      ])
    );
    expect(document.tables).toHaveLength(1);
    expect(document.tables[0].title).toBe("Line items");
    expect(document.tables[0].columns).toEqual([
      "Item",
      "Qty",
      "Unit price",
      "Total",
    ]);
    expect(document.tables[0].rows).toEqual([
      ["Foundry hosting", "2", "$500.00", "$1,000.00"],
      ["Support", "1", "$250.00", "$250.00"],
    ]);
    expect(document.tables[0].confidence).toBeGreaterThan(0.7);
  });

  it("reads tables and fields from an OCR image", async () => {
    if (!(await hasTesseract())) return;
    const fixture = path.join(
      process.cwd(),
      "tests/fixtures/structured-invoice.png"
    );
    const extracted = await extractBuffer(
      "structured-invoice.png",
      readFileSync(fixture)
    );
    expect(extracted.kind).toBe("ocr");
    const document = extractStructured(extracted.text, extracted.kind);
    expect(document.keyValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Vendor", value: "Contoso Ltd." }),
        expect.objectContaining({ key: "Invoice", value: "INV-4417" }),
      ])
    );
    expect(document.tables.length).toBeGreaterThan(0);
    expect(document.tables[0].columns.map((column) => column.toLowerCase())).toEqual([
      "item",
      "qty",
      "price",
    ]);
    expect(document.tables[0].rows.length).toBe(2);
  }, 60_000);

  it("warns instead of inventing structure when OCR is flat text", () => {
    const document = extractStructured(
      "This is a paragraph with no fields or columns at all.",
      "ocr"
    );
    expect(document.tables).toHaveLength(0);
    expect(document.keyValues).toHaveLength(0);
    expect(document.warnings.join(" ")).toMatch(/OCR text|No tables/i);
  });
});
