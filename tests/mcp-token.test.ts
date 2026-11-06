// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-mcp-token-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

type Token = typeof import("@/lib/knowledge/mcp-token");
let tokens: Token;

beforeAll(async () => {
  tokens = await import("@/lib/knowledge/mcp-token");
});

describe("internal MCP tokens", () => {
  it("signs a token that verifies for the same base", async () => {
    const token = await tokens.signInternalMcpToken("kb_1");
    expect(token.startsWith("internal.")).toBe(true);
    await expect(tokens.verifyInternalMcpToken(token, "kb_1")).resolves.toBe(true);
  });

  it("rejects a token for another base", async () => {
    const token = await tokens.signInternalMcpToken("kb_1");
    await expect(tokens.verifyInternalMcpToken(token, "kb_2")).resolves.toBe(false);
  });

  it("rejects a tampered token", async () => {
    const token = await tokens.signInternalMcpToken("kb_1");
    const tampered = token.replace(/.$/, token.endsWith("A") ? "B" : "A");
    await expect(tokens.verifyInternalMcpToken(tampered, "kb_1")).resolves.toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await tokens.signInternalMcpToken("kb_1", -1000);
    await expect(tokens.verifyInternalMcpToken(token, "kb_1")).resolves.toBe(false);
  });

  it("ignores a token without the internal prefix", async () => {
    await expect(
      tokens.verifyInternalMcpToken("some-user-token", "kb_1")
    ).resolves.toBe(false);
  });
});
