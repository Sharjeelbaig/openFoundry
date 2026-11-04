// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  readFileSync(resolve(root, "src/data/tool-catalog.json"), "utf8")
);
const setups = JSON.parse(
  readFileSync(resolve(root, "src/data/tool-setup.json"), "utf8")
);

const errors = [];
const validTypes = new Set(["Custom", "Remote MCP", "Local MCP", "Skills"]);
const validAvailability = new Set(["http", "mcp", "mcp-local", "local-skill"]);

function validUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function fail(message) {
  errors.push(message);
}

const ids = new Set();
const slugs = new Set();
for (const entry of catalog) {
  if (!entry.id) fail(`${entry.name}: missing id`);
  if (ids.has(entry.id)) fail(`${entry.name}: duplicate id`);
  ids.add(entry.id);

  if (!entry.slug) fail(`${entry.name}: missing slug`);
  if (slugs.has(entry.slug)) fail(`${entry.name}: duplicate slug ${entry.slug}`);
  slugs.add(entry.slug);

  if (!entry.name) fail(`${entry.id}: missing name`);
  if (!validTypes.has(entry.type)) fail(`${entry.name}: invalid type ${entry.type}`);
  if (!validAvailability.has(entry.availability))
    fail(`${entry.name}: invalid availability ${entry.availability}`);
  if (!entry.company) fail(`${entry.name}: missing company`);
  if (!entry.summary) fail(`${entry.name}: missing summary`);
  if (!entry.description) fail(`${entry.name}: missing description`);
  if (!Array.isArray(entry.docs)) fail(`${entry.name}: docs is not an array`);

  // Legal-cleanliness checks: the shipped catalog must not carry vendor icons,
  // the old Partner/Microsoft provider bucket, or copied connector operations.
  if (entry.icon) fail(`${entry.name}: vendor icon is still present`);
  if (entry.provider) fail(`${entry.name}: old provider bucket is still present`);
  if (Array.isArray(entry.tags) && entry.tags.length > 0)
    fail(`${entry.name}: vendor tags are still present`);

  if (entry.type === "Skills" && !entry.instructions)
    fail(`${entry.name}: skill has no local instructions`);
  if (entry.type === "Remote MCP" && !validUrl(entry.remoteUrl))
    fail(`${entry.name}: remote MCP endpoint is invalid`);
  for (const doc of entry.docs) {
    if (!validUrl(doc.url)) fail(`${entry.name}: invalid documentation URL`);
  }

  const setup = setups[entry.id];
  if (!setup) {
    fail(`${entry.name}: no setup record`);
    continue;
  }
  if (!Array.isArray(setup.authMethods) || setup.authMethods.length === 0)
    fail(`${entry.name}: no authentication methods`);
  if ((setup.operations || []).length > 0)
    fail(`${entry.name}: copied operations are still present`);
  if ((setup.runtimeUrls || []).length > 0)
    fail(`${entry.name}: hosted runtime URL is still present`);

  for (const method of setup.authMethods) {
    if (!method.label) fail(`${entry.name}: auth method without a label`);
    if (!method.type) fail(`${entry.name}: auth method without a type`);
    if (!Array.isArray(method.fields))
      fail(`${entry.name}: auth method fields is not an array`);
    if (method.type !== "none" && method.fields.length === 0)
      fail(`${entry.name}: auth method ${method.label} has no fields`);
    const fieldNames = new Set();
    for (const field of method.fields) {
      if (!field.name) fail(`${entry.name}: field without a name`);
      if (!field.label) fail(`${entry.name}: field ${field.name} has no label`);
      if (fieldNames.has(field.name))
        fail(`${entry.name}: duplicate field ${field.name}`);
      fieldNames.add(field.name);
      if (!["text", "password", "select"].includes(field.type))
        fail(`${entry.name}: field ${field.name} has invalid type`);
      if (field.type === "select" && !field.options?.length)
        fail(`${entry.name}: select field ${field.name} has no options`);
    }
    const oauth = method.oauth;
    if (oauth) {
      for (const key of ["clientId", "redirectUrl", "identityProvider"]) {
        if (oauth[key])
          fail(`${entry.name}: hosted OAuth ${key} is still present`);
      }
      for (const key of ["authorizationUrl", "tokenUrl", "refreshUrl"]) {
        if (oauth[key] && !validUrl(oauth[key]))
          fail(`${entry.name}: OAuth ${key} is not a valid URL`);
      }
    }
  }
}

const extraSetups = Object.keys(setups).filter((id) => !ids.has(id));
for (const id of extraSetups) fail(`setup record without catalog entry: ${id}`);

if (errors.length) {
  console.error(`Tool catalog audit failed with ${errors.length} issue(s):`);
  for (const error of errors.slice(0, 80)) console.error(`- ${error}`);
  if (errors.length > 80) console.error(`... and ${errors.length - 80} more`);
  process.exit(1);
}

const counts = catalog.reduce((acc, entry) => {
  acc[entry.type] = (acc[entry.type] || 0) + 1;
  return acc;
}, {});
console.log(
  `Tool catalog audit passed: ${catalog.length} entries, ${Object.entries(
    counts
  )
    .map(([type, count]) => `${count} ${type}`)
    .join(", ")}.`
);
