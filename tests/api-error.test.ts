// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { apiErrorMessage, errorBodyMessage } from "../src/lib/api-error";

function response(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("errorBodyMessage", () => {
  it("reads the nested message the authorization error uses", async () => {
    const res = response(403, {
      error: {
        message: "This action needs the chat.use permission.",
        type: "authorization_error",
        code: "insufficient_permissions",
      },
    });
    expect(await errorBodyMessage(res)).toBe(
      "This action needs the chat.use permission."
    );
  });

  it("reads a plain string error", async () => {
    const res = response(400, { error: "Choose a model first." });
    expect(await errorBodyMessage(res)).toBe("Choose a model first.");
  });

  it("reads a top-level message", async () => {
    const res = response(429, { message: "Rate limit reached." });
    expect(await errorBodyMessage(res)).toBe("Rate limit reached.");
  });

  it("returns null for a body that carries no message", async () => {
    expect(await errorBodyMessage(response(500, {}))).toBeNull();
    expect(await errorBodyMessage(response(502, "<html>bad gateway</html>"))).toBeNull();
  });

  it("returns null for an empty body", async () => {
    expect(await errorBodyMessage(new Response("", { status: 500 }))).toBeNull();
  });
});

describe("apiErrorMessage", () => {
  it("prefers the API message", async () => {
    const res = response(403, {
      error: { message: "This action needs the chat.use permission." },
    });
    expect(await apiErrorMessage(res, "The model did not respond")).toBe(
      "This action needs the chat.use permission."
    );
  });

  it("annotates the fallback with the status when the body has no message", async () => {
    const res = response(500, {});
    expect(await apiErrorMessage(res, "The model did not respond")).toBe(
      "The model did not respond (HTTP 500)"
    );
  });

  it("uses a generic fallback when the caller passes none", async () => {
    const res = response(401, {});
    expect(await apiErrorMessage(res)).toBe("The request failed (HTTP 401)");
  });
});
