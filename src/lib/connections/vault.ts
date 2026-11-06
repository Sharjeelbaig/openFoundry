// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ensureMachineKey } from "../directory/bootstrap";

/**
 * Secrets at rest.
 *
 * AES-256-GCM with a key derived from the machine key. The machine key file is
 * mode 0600, so anyone who can read the ciphertext can already read the key —
 * this protects backups, logs and accidental exposure, not a compromised host.
 * That limit is stated rather than implied.
 */

const AAD = Buffer.from("openfoundry/connections/v1");

async function deriveKey(): Promise<Buffer> {
  const machine = await ensureMachineKey();
  return createHash("sha256")
    .update(`openfoundry-connections:${machine}`)
    .digest();
}

export async function seal(value: Record<string, unknown>): Promise<string> {
  const key = await deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString("base64");
}

export async function unseal(sealed: string): Promise<Record<string, unknown>> {
  const key = await deriveKey();
  const raw = Buffer.from(sealed, "base64");
  if (raw.length < 12 + 16) throw new Error("Stored secret is malformed.");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  try {
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Stored secret could not be decrypted. The machine key changed; delete the connection and add it again."
    );
  }
}

/** A masked label that identifies a secret without revealing it. */
export function secretHint(secret: Record<string, unknown>): string {
  const first = Object.values(secret).find(
    (value) => typeof value === "string" && value.length > 0
  );
  if (typeof first !== "string") return "set";
  return first.length <= 4 ? "set" : `••••${first.slice(-4)}`;
}
