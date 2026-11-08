// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { csvRecords, extractStructured } from "../src/lib/structured";

const CSV = [
  "Vendor,Invoice,Total,Date",
  "Contoso Ltd.,INV-4417,1250.00,2026-01-05",
  "Fabrikam,INV-4418,980.50,2026-01-06",
  "Northwind,INV-4419,430.00,2026-01-07",
].join("\n");

describe("csvRecords", () => {
  it("honours quoted commas and escaped quotes", () => {
    expect(
      csvRecords('Name,Note\n"Contoso, Ltd.","He said ""hello"""\n')
    ).toEqual([
      ["Name", "Note"],
      ["Contoso, Ltd.", 'He said "hello"'],
    ]);
  });

  it("keeps a newline inside a quoted field", () => {
    expect(csvRecords('A,B\n"line one\nline two",x\n')).toEqual([
      ["A", "B"],
      ["line one\nline two", "x"],
    ]);
  });
});

describe("extractStructured: CSV", () => {
  it("turns a CSV into one table with its columns and rows", () => {
    const document = extractStructured(CSV, "text", "clinic-invoices.csv");
    expect(document.tables).toHaveLength(1);
    expect(document.tables[0].columns).toEqual([
      "Vendor",
      "Invoice",
      "Total",
      "Date",
    ]);
    expect(document.tables[0].rows).toHaveLength(3);
    expect(document.tables[0].rows[0]).toEqual([
      "Contoso Ltd.",
      "INV-4417",
      "1250.00",
      "2026-01-05",
    ]);
    expect(document.keyValues).toEqual([]);
    expect(document.warnings).toEqual([]);
  });

  it("detects the same table without a filename hint", () => {
    const document = extractStructured(CSV, "text");
    expect(document.tables).toHaveLength(1);
    expect(document.tables[0].columns).toHaveLength(4);
  });

  it("uses the filename hint for a two-row CSV", () => {
    const document = extractStructured(
      "Vendor,Total\nContoso,1250\n",
      "text",
      "short.csv"
    );
    expect(document.tables).toHaveLength(1);
    expect(document.tables[0].rows).toEqual([["Contoso", "1250"]]);
  });

  it("does not treat ordinary prose with commas as a table", () => {
    const document = extractStructured(
      "Hello, world.\nThis, too.\nAnd, more.",
      "text"
    );
    expect(document.tables).toHaveLength(0);
    expect(document.warnings).toContain(
      "No tables or key/value pairs were detected."
    );
  });
});

describe("extractStructured: JSON", () => {
  it("turns an array of objects into a table", () => {
    const document = extractStructured(
      JSON.stringify([
        { vendor: "Contoso", invoice: "INV-4417", total: 1250 },
        { vendor: "Fabrikam", invoice: "INV-4418", total: 980.5 },
      ]),
      "text",
      "invoices.json"
    );
    expect(document.tables).toHaveLength(1);
    expect(document.tables[0].columns).toEqual([
      "vendor",
      "invoice",
      "total",
    ]);
    expect(document.tables[0].rows).toEqual([
      ["Contoso", "INV-4417", "1250"],
      ["Fabrikam", "INV-4418", "980.5"],
    ]);
  });

  it("turns a flat object into key/value pairs", () => {
    const document = extractStructured(
      JSON.stringify({ vendor: "Contoso", invoice: "INV-4417", paid: false }),
      "text",
      "invoice.json"
    );
    expect(document.keyValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "vendor", value: "Contoso" }),
        expect.objectContaining({ key: "invoice", value: "INV-4417" }),
        expect.objectContaining({ key: "paid", value: "false" }),
      ])
    );
    expect(document.tables).toHaveLength(0);
  });

  it("reads an array property as a table and scalar siblings as fields", () => {
    const document = extractStructured(
      JSON.stringify({
        customer: "Contoso",
        items: [
          { sku: "A-1", qty: 2 },
          { sku: "B-2", qty: 1 },
        ],
      }),
      "text"
    );
    expect(document.tables).toHaveLength(1);
    expect(document.tables[0].title).toBe("items");
    expect(document.tables[0].rows).toEqual([
      ["A-1", "2"],
      ["B-2", "1"],
    ]);
    expect(document.keyValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "customer", value: "Contoso" }),
      ])
    );
  });

  it("falls back to the text parser for invalid JSON", () => {
    const document = extractStructured("{not valid json", "text", "bad.json");
    expect(document.tables).toHaveLength(0);
  });
});
