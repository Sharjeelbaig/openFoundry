// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "../store";
import type { AuditEvent } from "./types";

const FILE = "audit.jsonl";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Append-only. Auditing must never break a request, so every failure is
 * swallowed; the alternative is a 500 because the log disk is full.
 */
export async function appendAudit(
  event: Omit<AuditEvent, "at"> & { at?: string }
): Promise<void> {
  const line = JSON.stringify({ at: event.at ?? new Date().toISOString(), ...event });
  try {
    const dir = dataDir();
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, FILE);
    try {
      const stat = await fs.stat(target);
      if (stat.size > MAX_BYTES) {
        await fs.rename(target, `${target}.1`).catch(() => undefined);
      }
    } catch {
      // No file yet.
    }
    await fs.appendFile(target, `${line}\n`, "utf8");
  } catch {
    // Never throw from the audit path.
  }
}

export async function readAudit(limit = 200): Promise<AuditEvent[]> {
  try {
    const raw = await fs.readFile(path.join(dataDir(), FILE), "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as AuditEvent)
      .reverse();
  } catch {
    return [];
  }
}
