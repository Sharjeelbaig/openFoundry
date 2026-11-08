// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Read the actionable message out of a failed API response.
 *
 * The API answers with either `{ error: "text" }` or
 * `{ error: { message, type, code } }` (the OpenAI-style shape used for
 * authorization, rate-limit and validation failures). Both chat surfaces used
 * to throw a fixed "model did not respond" string and discard this body, so a
 * 403 permission denial looked like a runtime failure (OS-29).
 */
export async function errorBodyMessage(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as {
      error?: string | { message?: string };
      message?: string;
    };
    const error = data?.error;
    if (typeof error === "string" && error.trim()) return error.trim();
    if (
      error &&
      typeof error === "object" &&
      typeof error.message === "string" &&
      error.message.trim()
    ) {
      return error.message.trim();
    }
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message.trim();
    }
  } catch {
    // Not JSON (an HTML error page, an empty body): fall through.
  }
  return null;
}

/**
 * The message to show for a failed response: the API's own message when it
 * sent one, otherwise the caller's fallback annotated with the HTTP status so
 * the failure is at least distinguishable.
 */
export async function apiErrorMessage(
  res: Response,
  fallback = "The request failed"
): Promise<string> {
  const message = await errorBodyMessage(res);
  return message ?? `${fallback} (HTTP ${res.status})`;
}
