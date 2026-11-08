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

/* ------------------------------------------------------------------ */
/* CSV and JSON documents                                              */
/* ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Parse RFC 4180-style CSV, honouring quoted fields and escaped quotes. */
export function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      record.push(field);
      field = "";
      index += 1;
      continue;
    }
    if (char === "\r") {
      index += 1;
      continue;
    }
    if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }
  if (field.length || record.length) {
    record.push(field);
    records.push(record);
  }
  return records.filter((row) => row.some((cell) => cell.trim() !== ""));
}

function dominantWidth(records: string[][]): number {
  const counts = new Map<number, number>();
  for (const record of records) {
    counts.set(record.length, (counts.get(record.length) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
}

/** Build a table from a matrix whose first row is usually the header. */
function tableFromMatrix(records: string[][], page = 1): ExtractedTable | null {
  const rows = records.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length < 2) return null;
  const width = dominantWidth(rows);
  if (width < 2) return null;
  const first = rows[0].map((cell) => cell.trim());
  const headerIsNumeric = first.every(
    (cell) => !cell || /^[$€£]?\s?-?[\d.,%]+$/.test(cell)
  );
  const columns = headerIsNumeric
    ? Array.from({ length: width }, (_, column) => `Column ${column + 1}`)
    : first
        .slice(0, width)
        .map((cell, column) => cell || `Column ${column + 1}`);
  const body = headerIsNumeric ? rows : rows.slice(1);
  if (body.length === 0) return null;
  const normalized = body.map((row) => {
    const cells = row.slice(0, width).map((cell) => cell.trim());
    while (cells.length < width) cells.push("");
    if (row.length > width) {
      cells[width - 1] = `${cells[width - 1]} ${row
        .slice(width)
        .map((cell) => cell.trim())
        .join(" ")}`.trim();
    }
    return cells;
  });
  return {
    index: 0,
    columns,
    rows: normalized,
    lineStart: 1,
    lineEnd: records.length,
    page,
    confidence: 0.9,
  };
}

/**
 * A comma-separated document. When the filename says `.csv` this is trusted;
 * otherwise the shape has to be unambiguous so ordinary prose that happens to
 * contain commas is left to the text parser.
 */
function parseCsvDocument(
  text: string,
  kind: ExtractionKind,
  trusted: boolean
): StructuredDocument | null {
  if (!trusted && (text.includes("|") || text.includes("\t"))) return null;
  const records = csvRecords(text);
  if (records.length < 2) return null;
  const width = dominantWidth(records);
  if (width < 2) return null;
  const consistent =
    records.filter((record) => Math.abs(record.length - width) <= 1).length /
    records.length;
  if (consistent < 0.7) return null;
  if (!trusted) {
    const header = records[0].map((cell) => cell.trim());
    const numericData = records
      .slice(1)
      .some((record) =>
        record.some((cell) => /^[$€£]?\s?-?[\d.,%]+$/.test(cell.trim()))
      );
    if (records.length < 3 && !numericData) return null;
    if (header.length < 3 && !numericData) return null;
  }
  const table = tableFromMatrix(records);
  if (!table) return null;
  return { kind, keyValues: [], tables: [table], warnings: [] };
}

/** A JSON document: arrays of objects become tables, objects become fields. */
function parseJsonDocument(
  text: string,
  kind: ExtractionKind
): StructuredDocument | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const tables: ExtractedTable[] = [];
  const keyValues: KeyValuePair[] = [];
  const pushTable = (rows: Record<string, unknown>[], title?: string) => {
    const columns: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!columns.includes(key)) columns.push(key);
      }
    }
    if (columns.length === 0) return;
    tables.push({
      index: tables.length,
      title,
      columns,
      rows: rows.map((row) => columns.map((column) => cellText(row[column]))),
      lineStart: 1,
      lineEnd: 1,
      page: 1,
      confidence: 0.9,
    });
  };

  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isPlainObject)) {
      pushTable(value as Record<string, unknown>[]);
    } else if (
      value.length > 0 &&
      value.every((row) => Array.isArray(row))
    ) {
      const table = tableFromMatrix(
        (value as unknown[][]).map((row) => row.map(cellText))
      );
      if (table) tables.push(table);
    }
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (
        Array.isArray(item) &&
        item.length > 0 &&
        item.every(isPlainObject)
      ) {
        pushTable(item as Record<string, unknown>[], key);
      }
    }
    const leaves: [string, unknown][] = [];
    const flatten = (object: Record<string, unknown>, prefix: string) => {
      for (const [key, item] of Object.entries(object)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (
          Array.isArray(item) &&
          item.length > 0 &&
          item.every(isPlainObject)
        ) {
          continue;
        }
        if (isPlainObject(item)) flatten(item, path);
        else leaves.push([path, item]);
      }
    };
    flatten(value, "");
    for (const [key, item] of leaves) {
      keyValues.push({
        key,
        value: Array.isArray(item)
          ? item.map((entry) => cellText(entry)).join(", ")
          : cellText(item),
        line: 1,
        page: 1,
        confidence: 0.9,
      });
    }
  }

  if (tables.length === 0 && keyValues.length === 0) return null;
  return { kind, keyValues, tables, warnings: [] };
}

export function extractStructured(
  text: string,
  kind: ExtractionKind = "text",
  fileName?: string
): StructuredDocument {
  const json = parseJsonDocument(text, kind);
  if (json) return json;
  const csv = parseCsvDocument(
    text,
    kind,
    /\.csv$/i.test(fileName || "")
  );
  if (csv) return csv;

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
