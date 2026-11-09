// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Feedback delivery helpers.
 *
 * Kept out of the route file so the exact address, subject and encoding can be
 * tested without starting a server: the draft that opens must always go to the
 * support address with the "openFoundry Feedback" subject, whatever the body
 * contains.
 */

export const FEEDBACK_ADDRESS = "eng.sharjeel.baig@gmail.com";
export const FEEDBACK_SUBJECT = "openFoundry Feedback";
export const FEEDBACK_MAX_LENGTH = 4000;

export function buildFeedbackMailto(message: string) {
  return `mailto:${FEEDBACK_ADDRESS}?subject=${encodeURIComponent(
    FEEDBACK_SUBJECT
  )}&body=${encodeURIComponent(message)}`;
}

export function openerCommand(
  url: string,
  platform: NodeJS.Platform = process.platform
): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32")
    return { command: "rundll32", args: ["url.dll,FileProtocolHandler", url] };
  return { command: "xdg-open", args: [url] };
}
