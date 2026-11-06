// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".gif",
]);

/** A short PDF text layer is usually a scan with a stamp, not real content. */
export const SCANNED_TEXT_THRESHOLD = 40;

export type ExtractionKind = "text" | "pdf-text" | "ocr" | "binary";

export interface ExtractedText {
  text: string;
  kind: ExtractionKind;
}

let tesseractChecked: boolean | null = null;

export async function hasTesseract(): Promise<boolean> {
  if (tesseractChecked != null) return tesseractChecked;
  try {
    await execFileAsync("tesseract", ["--version"], { timeout: 5000 });
    tesseractChecked = true;
  } catch {
    tesseractChecked = false;
  }
  return tesseractChecked;
}

export function looksScanned(text: string): boolean {
  return text.replace(/\s+/g, " ").trim().length < SCANNED_TEXT_THRESHOLD;
}

function tempPath(extension: string): string {
  return path.join(
    os.tmpdir(),
    `openfoundry-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}${extension}`
  );
}

async function pdftotext(file: string): Promise<string> {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", file, "-"], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  return stdout;
}


interface OcrWord {
  page: number;
  block: number;
  paragraph: number;
  line: number;
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
}

/**
 * Reconstruct OCR text with tabs between wide word gaps. Plain tesseract
 * output collapses table columns into single spaces; the TSV positions keep
 * enough layout for the structured extractor to find columns.
 */
export function layoutFromTsv(tsv: string): string {
  const rows = tsv.split(/\r?\n/);
  const words: OcrWord[] = [];
  for (const row of rows.slice(1)) {
    if (!row.trim()) continue;
    const fields = row.split("\t");
    if (fields.length < 12) continue;
    const text = fields.slice(11).join("\t").trim();
    if (!text) continue;
    const level = Number(fields[0]);
    if (level !== 5) continue;
    words.push({
      page: Number(fields[1]) || 1,
      block: Number(fields[2]) || 0,
      paragraph: Number(fields[3]) || 0,
      line: Number(fields[4]) || 0,
      left: Number(fields[6]) || 0,
      top: Number(fields[7]) || 0,
      width: Number(fields[8]) || 0,
      height: Number(fields[9]) || 0,
      text,
    });
  }
  if (words.length === 0) return "";

  const groups = new Map<string, OcrWord[]>();
  for (const word of words) {
    const key = `${word.page}:${word.block}:${word.paragraph}:${word.line}`;
    const list = groups.get(key) || [];
    list.push(word);
    groups.set(key, list);
  }
  const lines = [...groups.values()].map((group) =>
    group.sort((a, b) => a.left - b.left)
  );
  lines.sort((a, b) => a[0].page - b[0].page || a[0].top - b[0].top);

  const heights = lines
    .map((line) => line[0]?.height || 0)
    .filter((height) => height > 0)
    .sort((a, b) => a - b);
  const lineHeight = heights[Math.floor(heights.length / 2)] || 20;

  const output: string[] = [];
  let page = lines[0]?.[0]?.page || 1;
  let previousBottom: number | null = null;
  for (const line of lines) {
    if (line[0].page !== page) {
      output.push("\f");
      page = line[0].page;
      previousBottom = null;
    } else if (
      previousBottom != null &&
      line[0].top - previousBottom > lineHeight * 1.7
    ) {
      output.push("");
    }
    let text = line[0].text;
    let previousRight = line[0].left + line[0].width;
    for (const word of line.slice(1)) {
      const gap = word.left - previousRight;
      text += gap > lineHeight * 1.2 ? "\t" : " ";
      text += word.text;
      previousRight = word.left + word.width;
    }
    output.push(text);
    previousBottom = Math.max(...line.map((word) => word.top + word.height));
  }
  return output.join("\n");
}

async function tesseractLayout(file: string): Promise<string> {
  const { stdout } = await execFileAsync("tesseract", [file, "stdout", "tsv"], {
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
  });
  return layoutFromTsv(stdout);
}

/** Renders each PDF page and OCRs it, preserving page breaks as form feeds. */
export async function ocrPdf(file: string): Promise<string> {
  if (!(await hasTesseract())) {
    throw new Error(
      "This PDF has no text layer and OCR is unavailable. Install tesseract (brew install tesseract) and sync again."
    );
  }
  const prefix = tempPath("");
  const pages: string[] = [];
  try {
    await execFileAsync(
      "pdftoppm",
      ["-r", "200", "-png", "-aa", "yes", file, prefix],
      { maxBuffer: 64 * 1024 * 1024, timeout: 180_000 }
    );
    const directory = path.dirname(prefix);
    const base = path.basename(prefix);
    const rendered = (await fs.readdir(directory))
      .filter((name) => name.startsWith(`${base}-`) && name.endsWith(".png"))
      .sort((a, b) => {
        const na = Number(a.match(/-(\d+)\.png$/)?.[1] || 0);
        const nb = Number(b.match(/-(\d+)\.png$/)?.[1] || 0);
        return na - nb;
      });
    for (const name of rendered) {
      const image = path.join(directory, name);
      pages.push((await tesseractLayout(image)).trim());
    }
  } finally {
    const directory = path.dirname(prefix);
    const base = path.basename(prefix);
    const leftovers = (await fs.readdir(directory).catch(() => [])) as string[];
    for (const name of leftovers) {
      if (name.startsWith(base)) {
        await fs.unlink(path.join(directory, name)).catch(() => undefined);
      }
    }
  }
  return pages.join("\n\f\n");
}

export async function ocrImage(file: string): Promise<string> {
  if (!(await hasTesseract())) {
    throw new Error(
      "OCR is unavailable. Install tesseract (brew install tesseract) and try again."
    );
  }
  return tesseractLayout(file);
}

/**
 * Extracts text from a local file. PDFs fall back to OCR when their text layer
 * is missing or too short to be real content; images always use OCR.
 */
export async function extractFile(file: string): Promise<ExtractedText> {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".pdf") {
    const text = await pdftotext(file).catch(() => "");
    if (!looksScanned(text)) return { text, kind: "pdf-text" };
    try {
      return { text: await ocrPdf(file), kind: "ocr" };
    } catch (error) {
      if (text.trim()) return { text, kind: "pdf-text" };
      throw error;
    }
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return { text: await ocrImage(file), kind: "ocr" };
  }
  const buffer = await fs.readFile(file);
  if (buffer.includes(0)) {
    throw new Error("Binary file skipped: no text layer.");
  }
  return { text: buffer.toString("utf8"), kind: "text" };
}

/** Extracts text from an in-memory upload. */
export async function extractBuffer(
  name: string,
  buffer: Buffer
): Promise<ExtractedText> {
  const extension = path.extname(name).toLowerCase();
  if (extension === ".pdf" || IMAGE_EXTENSIONS.has(extension)) {
    const temp = tempPath(extension);
    await fs.writeFile(temp, buffer);
    try {
      return await extractFile(temp);
    } finally {
      await fs.unlink(temp).catch(() => undefined);
    }
  }
  if (extension === ".docx") {
    throw new Error("DOCX is not supported yet. Save as .txt, .md or .pdf and upload again.");
  }
  if (buffer.includes(0)) {
    throw new Error("This file has no text layer (binary). Upload a text document, PDF or image.");
  }
  return { text: buffer.toString("utf8"), kind: "text" };
}

export function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());
}
