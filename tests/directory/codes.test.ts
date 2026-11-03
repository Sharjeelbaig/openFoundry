import { describe, expect, it } from "vitest";
import {
  ACCESS_CODE_LENGTH,
  generateAccessCode,
  generateBootstrapToken,
  group,
  hashSecret,
  newSalt,
  normalizeCode,
  randomChars,
  verifySecret,
} from "@/lib/directory/codes";

describe("code generation", () => {
  it("produces the documented shapes", () => {
    expect(generateAccessCode()).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    expect(generateBootstrapToken()).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){2}$/);
  });

  it("only uses characters that cannot be confused", () => {
    const code = randomChars(400);
    expect(code).not.toMatch(/[ILOU]/);
    expect(group("ABCDEFGH", 4)).toBe("ABCD-EFGH");
  });

  it("does not repeat codes", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 500; index += 1) seen.add(generateAccessCode());
    expect(seen.size).toBe(500);
  });
});

describe("normalizeCode", () => {
  it("accepts the ways people type a code", () => {
    const code = "7Q4MXR2AK9WP3FJH";
    expect(normalizeCode("7q4m-xr2a-k9wp-3fjh")).toBe(code);
    expect(normalizeCode(" 7Q4M XR2A K9WP 3FJH ")).toBe(code);
  });

  it("folds the characters Crockford folds", () => {
    expect(normalizeCode("O")).toBe("0");
    expect(normalizeCode("I")).toBe("1");
    expect(normalizeCode("L")).toBe("1");
    expect(normalizeCode("U")).toBe("V");
  });

  it("keeps the documented length", () => {
    expect(normalizeCode(generateAccessCode()).length).toBe(ACCESS_CODE_LENGTH);
  });
});

describe("hashing", () => {
  it("verifies the right secret and rejects the wrong one", () => {
    const salt = newSalt();
    const hash = hashSecret("ABCD-EFGH-JKMN-PQRS", salt);
    expect(verifySecret("ABCD-EFGH-JKMN-PQRS", salt, hash)).toBe(true);
    expect(verifySecret("ABCD-EFGH-JKMN-PQRT", salt, hash)).toBe(false);
  });

  it("salts, so the same secret hashes differently", () => {
    const code = "ABCD-EFGH-JKMN-PQRS";
    expect(hashSecret(code, newSalt())).not.toBe(hashSecret(code, newSalt()));
  });
});
