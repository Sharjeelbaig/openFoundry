// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { dataDir, readJson, writeJson } from "../store";
import { migrateFromSettings } from "./migrate";
import { DIRECTORY_VERSION, emptyDirectory, type Directory } from "./types";

const FILE = "directory.json";

/**
 * One writer at a time. Every mutation is read-modify-write on a JSON file,
 * and two concurrent assignment requests would otherwise lose one.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function normalize(raw: Partial<Directory> | null): Directory {
  if (!raw) return emptyDirectory();
  const now = Date.now();
  return {
    version: DIRECTORY_VERSION,
    principals: Array.isArray(raw.principals) ? raw.principals : [],
    credentials: Array.isArray(raw.credentials) ? raw.credentials : [],
    assignments: Array.isArray(raw.assignments) ? raw.assignments : [],
    sessions: Array.isArray(raw.sessions)
      ? raw.sessions.filter((session) => Date.parse(session.expiresAt) > now)
      : [],
  };
}

async function load(): Promise<Directory> {
  const existing = await readJson<Directory | null>(FILE, null);
  if (existing) return normalize(existing);
  const migrated = await migrateFromSettings();
  await writeJson(FILE, migrated);
  return migrated;
}

export async function getDirectory(): Promise<Directory> {
  return enqueue(load);
}

export async function mutateDirectory<T>(
  work: (directory: Directory) => T | Promise<T>
): Promise<T> {
  return enqueue(async () => {
    const directory = await load();
    const result = await work(directory);
    await writeJson(FILE, directory);
    return result;
  });
}

/** Tests only: drop the file so the next read starts from settings. */
export async function resetDirectoryFile(): Promise<void> {
  await fs.rm(path.join(dataDir(), FILE), { force: true });
}
