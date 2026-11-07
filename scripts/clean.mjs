#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Remove build outputs that Tauri and Next leave behind. The installed app and
 * the workspace data are never touched. Run it after a desktop build, or any
 * time the checkout starts to feel heavy.
 *
 *   npm run clean
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const targets = [
  ".next",
  ".desktop-cache",
  "src-tauri/target",
  "src-tauri/next-server",
  "src-tauri/resources",
  "landing-src/.build",
  "node_modules/.cache",
  "tsconfig.tsbuildinfo",
  // Android packaging: the downloaded Node/llama.cpp inputs, the staged server
  // zip and the generated project's build outputs. The next Android build
  // re-creates all of them.
  ".android-cache",
  "src-tauri/gen/android/app/build",
  "src-tauri/gen/android/app/src/main/jniLibs",
  "src-tauri/gen/android/.gradle",
  "src-tauri/gen/android/app/src/main/assets/openfoundry-server.zip",
];

function sizeKb(target) {
  if (!existsSync(target)) return 0;
  try {
    if (process.platform === "win32") return 0;
    const out = execFileSync("du", ["-sk", target], { encoding: "utf8" });
    return Number.parseInt(out.trim().split(/\s+/)[0], 10) || 0;
  } catch {
    return 0;
  }
}

let before = 0;
let after = 0;
const removed = [];

for (const relative of targets) {
  const target = path.join(root, relative);
  if (!existsSync(target)) continue;
  before += sizeKb(target);
  rmSync(target, { recursive: true, force: true });
  after += sizeKb(target);
  removed.push(relative);
}

const freed = Math.max(0, Math.round((before - after) / 1024));
console.log(
  removed.length
    ? `Removed ${removed.length} build output${removed.length === 1 ? "" : "s"}: ${removed.join(", ")}.`
    : "Nothing to clean."
);
console.log(`Freed about ${freed} MB. Workspace data and the installed app were not touched.`);
