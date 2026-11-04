#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Mint an access code for the owner of a local install.
 *
 * This is the recovery path: it needs the same filesystem access the server
 * needs, so it grants nothing an operator did not already have. The desktop
 * app does not need it — it signs itself in with the machine credential.
 *
 *   npm run access-code            # owner of the first install
 *   npm run access-code -- --email you@example.com
 */

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const args = process.argv.slice(2);
const desktop = args.includes("--desktop");

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
    return path.join(
      process.env.APPDATA || "",
      "app.openfoundry.desktop",
      "data"
    );
  }
  return path.join(
    process.env.HOME || "",
    ".local",
    "share",
    "app.openfoundry.desktop",
    "data"
  );
}

const dataDir =
  process.env.OPENFOUNDRY_DATA_DIR?.trim() ||
  (desktop ? desktopDataDir() : path.join(process.cwd(), "data"));
const FILE = path.join(dataDir, "directory.json");

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

function code() {
  return chars(16).match(/.{4}/g).join("-");
}

function hash(secret, salt) {
  return createHash("sha256").update(`${salt}:${secret}`).digest("hex");
}

const emailFlag = args.indexOf("--email");
const wantedEmail = emailFlag === -1 ? "" : (args[emailFlag + 1] || "").toLowerCase();

if (!existsSync(FILE)) {
  console.error(
    `No directory at ${FILE}. Start openFoundry once so it can create one.`
  );
  if (!desktop) {
    console.error(
      "If you are using the desktop app, run: npm run access-code -- --desktop"
    );
  }
  process.exit(1);
}

const directory = JSON.parse(readFileSync(FILE, "utf8"));
const ownerIds = new Set(
  directory.assignments
    .filter((assignment) => assignment.roleId === "role_owner" && assignment.scope === "/")
    .map((assignment) => assignment.principalId)
);
const owners = directory.principals.filter(
  (principal) => ownerIds.has(principal.id) && !principal.disabledAt
);

if (owners.length === 0) {
  console.error(
    "This directory has no owner. Open /setup with the token printed by the server."
  );
  process.exit(1);
}

const target = wantedEmail
  ? owners.find((principal) => principal.email.toLowerCase() === wantedEmail)
  : owners[0];

if (!target) {
  console.error(
    `No owner with that email. Owners: ${owners.map((owner) => owner.email).join(", ")}`
  );
  process.exit(1);
}

const secret = code();
const salt = randomBytes(16).toString("base64");
const now = new Date().toISOString();

// One live code per person.
directory.credentials = directory.credentials.filter(
  (credential) =>
    !(credential.principalId === target.id && credential.kind === "access_code")
);
directory.credentials.push({
  id: `cred_${randomBytes(4).toString("hex")}`,
  principalId: target.id,
  kind: "access_code",
  lookup: secret.replace(/-/g, "").slice(0, 4),
  salt,
  hash: hash(secret.replace(/-/g, ""), salt),
  createdAt: now,
});

writeFileSync(FILE, JSON.stringify(directory, null, 2), "utf8");

console.log(`Directory: ${dataDir}`);
console.log(`Access code for ${target.name} <${target.email}>:`);
console.log("");
console.log(`  ${secret}`);
console.log("");
console.log("It replaces any previous code for this person.");
