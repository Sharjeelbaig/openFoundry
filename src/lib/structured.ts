// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import type { ExtractionKind } from "./knowledge/extract";

/**
 * Deterministic structured extraction over text or OCR output.
 *
 * This is not a trained document-understanding model. It finds repeated
 * multi-column rows and label/value lines, reports the line and page where each
 * came from, and says when OCR layout was too irregular to infer a table.
 */

export interface KeyValuePair {
  key: string;
  value: string;
  line: number;
  page: number;
  confidence: number;
}

export interface ExtractedTable {
  index: number;
  title?: string;
  columns: string[];
  rows: string[][];
  lineStart: number;
  lineEnd: number;
  page: number;
  confidence: number;
}

export interface StructuredDocument {
  kind: ExtractionKind;
  keyValues: KeyValuePair[];
  tables: ExtractedTable[];
  warnings: string[];
}

interface Line {
  text: string;
  line: number;
  page: number;
}

interface TableRow {
  cells: string[];
  line: number;
  page: number;
}

function linesWithPages(text: string): Line[] {
  const lines: Line[] = [];
  let page = 1;
  let number = 1;
  for (const raw of text.split("\n")) {
    if (raw.includes("\f")) {
      const parts = raw.split("\f");
      for (let index = 0; index < parts.length; index += 1) {
        if (index > 0) page += 1;
        if (parts[index].trim()) {
          lines.push({ text: parts[index], line: number, page });
          number += 1;
        }
      }
    } else {
      lines.push({ text: raw, line: number, page });
      number += 1;
    }
  }
  return lines;
}

function cellsFor(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.includes("|")) {
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length >= 2 && cells.some(Boolean)) return cells;
  }
  if (trimmed.includes("\t")) {
    const cells = trimmed.split("\t").map((cell) => cell.trim());
    if (cells.length >= 2 && cells.some(Boolean)) return cells;
  }
  const spaced = trimmed.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  if (spaced.length >= 2) return spaced;
  return null;
}

function isSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function looksNumeric(cells: string[]): boolean {
  return cells.every((cell) =>
    /^[$€£]?\s?-?[\d.,%]+$/.test(cell.trim())
  );
}

function dominantCount(rows: TableRow[]): number {
  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.cells.length, (counts.get(row.cells.length) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
}

function tableTitle(lines: Line[], startIndex: number, tableLines: Set<number>): string | undefined {
  for (let index = startIndex - 1; index >= Math.max(0, startIndex - 3); index -= 1) {
    const candidate = lines[index].text.trim();
    if (!candidate || tableLines.has(lines[index].line)) continue;
    if (candidate.length > 80 || /[.!?]$/.test(candidate)) return undefined;
    if (/[:：]\s*\S/.test(candidate)) return undefined;
    return candidate.replace(/[:：]\s*$/, "") || undefined;
  }
  return undefined;
}

export function extractStructured(
  text: string,
  kind: ExtractionKind = "text"
): StructuredDocument {
  const lines = linesWithPages(text);
  const tables: ExtractedTable[] = [];
  const tableLines = new Set<number>();
  let index = 0;

  while (index < lines.length) {
    const start = index;
    const rows: TableRow[] = [];
    while (index < lines.length) {
      const cells = cellsFor(lines[index].text);
      if (!cells) break;
      if (isSeparator(cells)) {
        rows.push({ cells, line: lines[index].line, page: lines[index].page });
        index += 1;
        continue;
      }
      rows.push({ cells, line: lines[index].line, page: lines[index].page });
      index += 1;
    }
    const dataRows = rows.filter((row) => !isSeparator(row.cells));
    if (dataRows.length >= 2) {
      const width = dominantCount(dataRows);
      const consistent =
        dataRows.filter((row) => Math.abs(row.cells.length - width) <= 1).length /
        dataRows.length;
      if (width >= 2 && consistent >= 0.7) {
        const first = dataRows[0].cells;
        const headerIsNumeric = looksNumeric(first);
        const columns = headerIsNumeric
          ? first.map((_, column) => `Column ${column + 1}`)
          : first.slice(0, width);
        const body = headerIsNumeric ? dataRows : dataRows.slice(1);
        const normalized = body.map((row) => {
          const cells = row.cells.slice(0, width);
          while (cells.length < width) cells.push("");
          if (row.cells.length > width) {
            cells[width - 1] = `${cells[width - 1]} ${row.cells
              .slice(width)
              .join(" ")}`.trim();
          }
          return cells;
        });
        const page = dataRows[0].page;
        tables.push({
          index: tables.length,
          title: tableTitle(lines, start, tableLines),
          columns: columns.map((column, columnIndex) => column || `Column ${columnIndex + 1}`),
          rows: normalized,
          lineStart: dataRows[0].line,
          lineEnd: dataRows[dataRows.length - 1].line,
          page,
          confidence: Math.min(
            0.95,
            0.55 + consistent * 0.3 + (width >= 3 ? 0.1 : 0)
          ),
        });
        for (const row of dataRows) tableLines.add(row.line);
      }
    }
    if (index === start) index += 1;
  }

  const keyValues: KeyValuePair[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (tableLines.has(line.line)) continue;
    const textLine = line.text.trim();
    if (!textLine || textLine.length > 320) continue;
    if (/^(https?:\/\/|mailto:)/i.test(textLine)) continue;

    const colon = /^([A-Za-z][A-Za-z0-9 _./&()'-]{0,79}?)\s*[:：]\s*(.{1,240})$/.exec(
      textLine
    );
    if (colon) {
      const key = colon[1].trim();
      const value = colon[2].trim();
      if (key && value && !/^https?$/i.test(key)) {
        const signature = `${key.toLowerCase()}\u0000${value.toLowerCase()}`;
        if (!seen.has(signature)) {
          seen.add(signature);
          keyValues.push({
            key,
            value,
            line: line.line,
            page: line.page,
            confidence: 0.9,
          });
        }
        continue;
      }
    }

    const cells = cellsFor(line.text);
    if (cells?.length === 2) {
      const [key, value] = cells;
      if (
        key.length <= 60 &&
        value.length <= 240 &&
        /^[A-Z][A-Za-z0-9 /&()._-]*$/.test(key) &&
        !/^[$€£]?\s?-?[\d.,%]+$/.test(value)
      ) {
        const signature = `${key.toLowerCase()}\u0000${value.toLowerCase()}`;
        if (!seen.has(signature)) {
          seen.add(signature);
          keyValues.push({
            key,
            value,
            line: line.line,
            page: line.page,
            confidence: 0.65,
          });
        }
      }
    }
  }

  const warnings: string[] = [];
  if (kind === "ocr" && tables.length === 0) {
    warnings.push(
      "OCR text contained no consistent multi-column rows; tables may be flattened. Check the raw text."
    );
  }
  if (kind === "ocr" && keyValues.length === 0) {
    warnings.push(
      "OCR text contained no label/value lines. OCR may have merged or split fields."
    );
  }
  if (tables.length === 0 && keyValues.length === 0) {
    warnings.push("No tables or key/value pairs were detected.");
  }

  return { kind, keyValues, tables, warnings };
}
