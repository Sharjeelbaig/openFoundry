#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * openFoundry command line.
 *
 * Installed with the desktop app so an operator can recover or revoke access
 * from a terminal without the UI:
 *
 *   openFoundry access-code                  mint a code for the first owner
 *   openFoundry access-code --email a@b.c    mint a code for one owner
 *   openFoundry access-code list             show every access code and its state
 *   openFoundry access-code revoke           revoke every owner code and session
 *   openFoundry access-code revoke --email a@b.c
 *   openFoundry status                       show the data directory and owners
 *
 * It reads the same directory.json the server reads, so it grants nothing an
 * operator with filesystem access did not already have.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 16;

const HELP = `
openFoundry command line

Usage:
  openFoundry access-code [--email <address>]     Mint an access code
  openFoundry access-code list                    List access codes
  openFoundry access-code revoke [--email <address>]
                                                  Revoke codes and sessions
  openFoundry status                              Show install and owners
  openFoundry --help                              This message

Options:
  --data-dir <path>    Read a specific data directory
  --email <address>    Target one owner instead of the first
  --json               Machine-readable output

Environment:
  OPENFOUNDRY_DATA_DIR   Overrides the detected data directory
`.trim();

function desktopDataDir() {
  if (process.platform === "darwin") {
    return path.join(
      process.env.HOME || "",
      "Library",
      "Application Support",
      "app.openfoundry.desktop",
      "data"
    );
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || "", "app.openfoundry.desktop", "data");
  }
  return path.join(
    process.env.HOME || "",
    ".local",
    "share",
    "app.openfoundry.desktop",
    "data"
  );
}

function parseArgs(argv) {
  const flags = { email: "", dataDir: "", json: false, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--email") flags.email = (argv[++i] || "").toLowerCase();
    else if (arg.startsWith("--email="))
      flags.email = arg.slice("--email=".length).toLowerCase();
    else if (arg === "--data-dir") flags.dataDir = argv[++i] || "";
    else if (arg.startsWith("--data-dir=")) flags.dataDir = arg.slice(11);
    else if (arg === "--desktop") {
      /* kept for compatibility; desktop is the default */
    } else rest.push(arg);
  }
  return { flags, rest };
}

function resolveDataDir(flags) {
  const chosen =
    flags.dataDir ||
    process.env.OPENFOUNDRY_DATA_DIR?.trim() ||
    desktopDataDir();
  return path.resolve(chosen);
}

function chars(length) {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (out.length === length) break;
      out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

function newCode() {
  return chars(CODE_LENGTH).match(/.{4}/g).join("-");
}

function hash(secret, salt) {
  return createHash("sha256").update(`${salt}:${secret}`).digest("hex");
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function loadDirectory(file) {
  if (!existsSync(file)) {
    fail(
      `No directory at ${file}.\n` +
        "Start openFoundry once so it can create one, or pass --data-dir <path>."
    );
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Could not read ${file}: ${error.message}`);
  }
}

/** Write through a temp file so a running server never reads a partial file. */
function saveDirectory(file, directory) {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(directory, null, 2), "utf8");
  try {
    renameSync(temp, file);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      /* best effort */
    }
    fail(`Could not write ${file}: ${error.message}`);
  }
}

function owners(directory) {
  const ownerIds = new Set(
    directory.assignments
      .filter((a) => a.roleId === "role_owner" && a.scope === "/")
      .map((a) => a.principalId)
  );
  return directory.principals.filter(
    (p) => ownerIds.has(p.id) && !p.disabledAt
  );
}

function pickOwner(directory, email) {
  const list = owners(directory);
  if (list.length === 0) {
    fail(
      "This directory has no owner yet.\n" +
        "Open /setup with the token printed by the server to claim it."
    );
  }
  if (!email) return list[0];
  const match = list.find((p) => p.email.toLowerCase() === email);
  if (!match) {
    fail(
      `No owner with that email.\nOwners: ${list
        .map((p) => `${p.name} <${p.email}>`)
        .join(", ")}`
    );
  }
  return match;
}

function liveCodes(directory, principalId) {
  return directory.credentials.filter(
    (c) => c.kind === "access_code" && c.principalId === principalId && !c.revokedAt
  );
}

function mint(directory, file, owner, flags) {
  const secret = newCode();
  const salt = randomBytes(16).toString("base64");
  const now = new Date().toISOString();
  const normalized = secret.replace(/-/g, "");

  // One live code per person: the old one is revoked on the same write.
  for (const credential of directory.credentials) {
    if (
      credential.principalId === owner.id &&
      credential.kind === "access_code" &&
      !credential.revokedAt
    ) {
      credential.revokedAt = now;
    }
  }
  directory.credentials.push({
    id: `cred_${randomBytes(4).toString("hex")}`,
    principalId: owner.id,
    kind: "access_code",
    lookup: normalized.slice(0, 4),
    salt,
    hash: hash(normalized, salt),
    createdAt: now,
  });
  saveDirectory(file, directory);

  if (flags.json) {
    console.log(
      JSON.stringify({ code: secret, principalId: owner.id, email: owner.email })
    );
    return;
  }
  console.log(`Directory: ${path.dirname(file)}`);
  console.log(`Access code for ${owner.name} <${owner.email}>:`);
  console.log("");
  console.log(`  ${secret}`);
  console.log("");
  console.log("It replaces any previous code for this person.");
}

function revoke(directory, file, targets, flags) {
  const now = new Date().toISOString();
  const results = [];
  for (const owner of targets) {
    let codes = 0;
    for (const credential of directory.credentials) {
      if (
        credential.principalId === owner.id &&
        credential.kind === "access_code" &&
        !credential.revokedAt
      ) {
        credential.revokedAt = now;
        codes += 1;
      }
    }
    const before = directory.sessions.length;
    directory.sessions = directory.sessions.filter(
      (session) => session.principalId !== owner.id
    );
    results.push({
      name: owner.name,
      email: owner.email,
      codes,
      sessions: before - directory.sessions.length,
    });
  }
  saveDirectory(file, directory);

  if (flags.json) {
    console.log(JSON.stringify({ revoked: results }));
    return;
  }
  console.log(`Directory: ${path.dirname(file)}`);
  for (const item of results) {
    console.log(
      `Revoked ${item.codes} access code(s) and signed out ${item.sessions} session(s) for ${item.name} <${item.email}>.`
    );
  }
  if (results.every((item) => item.codes === 0)) {
    console.log("");
    console.log("There were no live access codes to revoke.");
  }
}

function listCodes(directory, file, targets, flags) {
  const rows = [];
  for (const owner of targets) {
    for (const credential of directory.credentials) {
      if (credential.kind !== "access_code") continue;
      if (credential.principalId !== owner.id) continue;
      const expired =
        credential.expiresAt && Date.parse(credential.expiresAt) <= Date.now();
      rows.push({
        owner: `${owner.name} <${owner.email}>`,
        lookup: credential.lookup,
        state: credential.revokedAt
          ? "revoked"
          : expired
          ? "expired"
          : "live",
        createdAt: credential.createdAt,
        lastUsedAt: credential.lastUsedAt || "",
      });
    }
  }

  if (flags.json) {
    console.log(JSON.stringify({ directory: path.dirname(file), codes: rows }));
    return;
  }
  console.log(`Directory: ${path.dirname(file)}`);
  if (rows.length === 0) {
    console.log("No access codes have been issued yet.");
    return;
  }
  const width = Math.max(...rows.map((r) => r.owner.length));
  console.log("");
  console.log(
    `${"OWNER".padEnd(width)}  CODE     STATE     CREATED               LAST USED`
  );
  for (const row of rows) {
    console.log(
      `${row.owner.padEnd(width)}  ${row.lookup}-…  ${row.state.padEnd(
        8
      )}  ${row.createdAt}  ${row.lastUsedAt || "never"}`
    );
  }
}

function status(directory, file, flags) {
  const data = path.dirname(file);
  const list = owners(directory);
  if (flags.json) {
    console.log(
      JSON.stringify({
        directory: data,
        owners: list.map((p) => ({ name: p.name, email: p.email })),
        principals: directory.principals.length,
        sessions: directory.sessions.length,
        liveCodes: directory.credentials.filter(
          (c) => c.kind === "access_code" && !c.revokedAt
        ).length,
      })
    );
    return;
  }
  console.log(`openFoundry`);
  console.log(`  data directory  ${data}`);
  console.log(`  people          ${directory.principals.length}`);
  console.log(`  active sessions ${directory.sessions.length}`);
  console.log(
    `  live codes      ${
      directory.credentials.filter(
        (c) => c.kind === "access_code" && !c.revokedAt
      ).length
    }`
  );
  console.log(
    `  owners          ${
      list.length ? list.map((p) => `${p.name} <${p.email}>`).join(", ") : "none"
    }`
  );
}

function main() {
  const { flags, rest } = parseArgs(process.argv.slice(2));
  const command = rest[0] || "";

  if (flags.help || !command) {
    console.log(HELP);
    process.exit(flags.help ? 0 : 1);
  }

  const dataDir = resolveDataDir(flags);
  const file = path.join(dataDir, "directory.json");
  const directory = loadDirectory(file);

  if (command === "status") {
    status(directory, file, flags);
    return;
  }

  if (command !== "access-code" && command !== "access-code:") {
    fail(`Unknown command "${command}".\n\n${HELP}`);
  }

  const action = rest[1] || "mint";

  if (action === "mint") {
    mint(directory, file, pickOwner(directory, flags.email), flags);
    return;
  }
  if (action === "list") {
    listCodes(directory, file, owners(directory), flags);
    return;
  }
  if (action === "revoke") {
    const targets = flags.email
      ? [pickOwner(directory, flags.email)]
      : owners(directory);
    if (targets.length === 0) {
      fail("This directory has no owner, so there are no codes to revoke.");
    }
    revoke(directory, file, targets, flags);
    return;
  }

  fail(`Unknown access-code action "${action}".\n\n${HELP}`);
}

main();
