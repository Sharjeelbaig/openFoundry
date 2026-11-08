// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useState } from "react";
import {
  DocumentText20Regular,
  Table20Regular,
} from "@fluentui/react-icons";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";

interface KeyValuePair {
  key: string;
  value: string;
  line: number;
  page: number;
  confidence: number;
}

interface ExtractedTable {
  index: number;
  title?: string;
  columns: string[];
  rows: string[][];
  lineStart: number;
  lineEnd: number;
  page: number;
  confidence: number;
}

interface StructuredResult {
  name?: string;
  kind: string;
  keyValues: KeyValuePair[];
  tables: ExtractedTable[];
  warnings: string[];
}

export default function ExtractPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"upload" | "text">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState(
    "Vendor: Contoso Ltd.\nInvoice: INV-4417\n\nLine items\n| Item | Qty | Price |\n| --- | --- | --- |\n| Foundry | 2 | 500 |\n| Support | 1 | 250 |"
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StructuredResult | null>(null);

  const extract = async () => {
    setBusy(true);
    try {
      let res: Response;
      if (mode === "upload") {
        if (!file) throw new Error("Choose a PDF, image or text file first.");
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/extract/structured", {
          method: "POST",
          body: form,
        });
      } else {
        res = await fetch("/api/extract/structured", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      }
      const json = (await res.json().catch(() => ({}))) as StructuredResult & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Extraction failed.");
      setResult(json);
      toast(
        `${json.tables.length} table${json.tables.length === 1 ? "" : "s"}, ${
          json.keyValues.length
        } key/value pair${json.keyValues.length === 1 ? "" : "s"}`,
        "success"
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Extraction failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Structured extraction</h1>
          <p className="page-subtitle">
            Tables and key/value pairs from PDFs, images or text. PDFs and images
            use the same local extractor as knowledge ingestion, including OCR.
          </p>
        </div>
      </div>

      <div className="operate-card">
        <div className="tabbar" style={{ marginTop: -4 }}>
          <button
            className={`tab${mode === "upload" ? " active" : ""}`}
            onClick={() => setMode("upload")}
          >
            Upload document
          </button>
          <button
            className={`tab${mode === "text" ? " active" : ""}`}
            onClick={() => setMode("text")}
          >
            Paste text
          </button>
        </div>

        {mode === "upload" ? (
          <label className="field mt-12">
            <span className="field-label">PDF, image or text file</span>
            <input
              className="input"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.md,.csv,.json"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
        ) : (
          <label className="field mt-12">
            <span className="field-label">Text</span>
            <textarea
              className="textarea"
              style={{ minHeight: 180 }}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
        )}

        <button
          className="btn btn-primary mt-12"
          onClick={() => void extract()}
          disabled={busy || (mode === "upload" && !file)}
        >
          {busy ? <Spinner /> : <Table20Regular />} Extract structure
        </button>
      </div>

      {result && (
        <div className="stack mt-16" style={{ gap: 14 }}>
          <div className="banner info">
            <DocumentText20Regular />
            <span>
              {result.name ? `${result.name} · ` : ""}
              {result.kind === "ocr"
                ? "OCR text"
                : result.kind === "pdf-text"
                ? "PDF text layer"
                : "text"}{" "}
              · {result.tables.length} table
              {result.tables.length === 1 ? "" : "s"} ·{" "}
              {result.keyValues.length} key/value pair
              {result.keyValues.length === 1 ? "" : "s"}
            </span>
          </div>

          {result.warnings.map((warning) => (
            <div className="banner error" key={warning}>
              {warning}
            </div>
          ))}

          {result.keyValues.length > 0 && (
            <div className="operate-card">
              <h3 className="mb-8">Key/value pairs</h3>
              <div className="table-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Value</th>
                      <th>Where</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.keyValues.map((pair, index) => (
                      <tr key={`${pair.key}-${pair.line}-${index}`}>
                        <td className="strong">{pair.key}</td>
                        <td>{pair.value}</td>
                        <td className="muted text-12">
                          page {pair.page}, line {pair.line}
                        </td>
                        <td className="muted text-12">
                          {pair.confidence.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.tables.map((table) => (
            <div className="operate-card" key={table.index}>
              <div className="row between mb-8">
                <h3>
                  {table.title || `Table ${table.index + 1}`}
                  <span className="muted text-12">
                    {" "}
                    · page {table.page} · lines {table.lineStart}–{table.lineEnd}
                  </span>
                </h3>
                <span className="badge gray">
                  {table.confidence.toFixed(2)}
                </span>
              </div>
              <div className="table-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      {table.columns.map((column, index) => (
                        <th key={`${column}-${index}`}>{column || "—"}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {result.tables.length === 0 && result.keyValues.length === 0 && (
            <div className="empty">
              <Table20Regular />
              <h2>No structured fields detected</h2>
              <p>
                The document is readable, but no consistent table columns or
                label/value lines were found.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
