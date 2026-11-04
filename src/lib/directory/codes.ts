// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Access codes, bootstrap tokens and the hashing around them.
 *
 * Crockford base32 without I, L, O and U: easier to read out loud, and the
 * normaliser folds the characters people confuse.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const ACCESS_CODE_LENGTH = 16;
export const BOOTSTRAP_TOKEN_LENGTH = 12;

export function randomChars(length: number): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (out.length === length) break;
      // 256 % 32 === 0, so this is uniform.
      out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

export function group(value: string, size = 4): string {
  return value.match(new RegExp(`.{1,${size}}`, "g"))?.join("-") ?? value;
}

/** 16 characters, 80 bits, shown as XXXX-XXXX-XXXX-XXXX. */
export function generateAccessCode(): string {
  return group(randomChars(ACCESS_CODE_LENGTH));
}

/** 12 characters, 60 bits, shown as XXXX-XXXX-XXXX. */
export function generateBootstrapToken(): string {
  return group(randomChars(BOOTSTRAP_TOKEN_LENGTH));
}

export function generateMachineKey(): string {
  return randomBytes(32).toString("base64url");
}

/** Uppercase, strip separators, fold the characters Crockford folds. */
export function normalizeCode(input: string): string {
  return String(input)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

export function newSalt(): string {
  return randomBytes(16).toString("base64");
}

export function hashSecret(secret: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${secret}`).digest("hex");
}

export function verifySecret(secret: string, salt: string, hash: string): boolean {
  const candidate = Buffer.from(hashSecret(secret, salt), "hex");
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
