// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { connectorFor } from "@/lib/knowledge/sources";
import { catalogEntry } from "@/lib/knowledge/catalog";

const root = mkdtempSync(path.join(tmpdir(), "openfoundry-export-"));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("SharePoint/OneDrive export connector", () => {
  it("indexes a local export folder with source metadata", async () => {
    const folder = path.join(root, "sharepoint");
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      path.join(folder, "policy.md"),
      "# Travel policy\n\nEconomy class for flights under six hours."
    );
    const connector = connectorFor("sharepoint-export");
    expect(connector).toBeTruthy();
    expect(connector!.validate({})).toMatch(/folder path/i);
    const items = await connector!.discover({ config: { path: folder } });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("policy.md");
    expect(items[0].content).toContain("Economy class");
    expect(items[0].metadata?.sharePointExport).toBe(true);
    expect(catalogEntry("sharepoint-export")?.available).toBe(true);
  });
});

describe("Fabric export connector", () => {
  it("indexes CSV rows and JSONL records", async () => {
    const folder = path.join(root, "fabric");
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      path.join(folder, "invoices.csv"),
      "invoice,vendor,total\nINV-1,Contoso,1250.00\nINV-2,Fabrikam,980.50\n"
    );
    writeFileSync(
      path.join(folder, "events.jsonl"),
      '{"event":"opened","user":"a"}\n{"event":"closed","user":"b"}\n'
    );
    const connector = connectorFor("fabric-export");
    expect(connector).toBeTruthy();
    expect(connector!.validate({})).toMatch(/export folder/i);
    const items = await connector!.discover({
      config: { path: folder, titleColumn: "invoice" },
    });
    expect(items).toHaveLength(4);
    const invoice = items.find((item) => item.title.includes("INV-1"));
    expect(invoice?.content).toContain("vendor: Contoso");
    expect(invoice?.content).toContain("total: 1250.00");
    expect(invoice?.metadata?.fabricExport).toBe(true);
    const event = items.find((item) => item.content.includes("event: opened"));
    expect(event?.content).toContain("user: a");
    expect(catalogEntry("fabric-export")?.available).toBe(true);
  });

  it("respects the row limit and title column", async () => {
    const folder = path.join(root, "fabric-limit");
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      path.join(folder, "rows.csv"),
      "name,value\none,1\ntwo,2\nthree,3\n"
    );
    const items = await connectorFor("fabric-export")!.discover({
      config: { path: folder, titleColumn: "name", maxRows: 2 },
    });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.title)).toEqual(["one", "two"]);
  });
});
