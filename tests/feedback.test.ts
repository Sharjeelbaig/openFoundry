// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  FEEDBACK_ADDRESS,
  FEEDBACK_SUBJECT,
  buildFeedbackMailto,
  openerCommand,
} from "@/lib/feedback";

describe("feedback mailto", () => {
  it("addresses the support mailbox with the fixed subject", () => {
    const url = buildFeedbackMailto("The agent builder is great.");
    expect(url.startsWith(`mailto:${FEEDBACK_ADDRESS}?`)).toBe(true);
    expect(url).toContain(`subject=${encodeURIComponent(FEEDBACK_SUBJECT)}`);
    expect(url).toContain(
      `body=${encodeURIComponent("The agent builder is great.")}`
    );
  });

  it("encodes characters that would otherwise break the query string", () => {
    const url = buildFeedbackMailto("a&b=c?d #e %f + g");
    const body = url.split("&body=")[1];
    expect(body).toBe(encodeURIComponent("a&b=c?d #e %f + g"));
    expect(url.split("&").length).toBe(2);
  });

  it("uses the platform opener for the draft", () => {
    expect(openerCommand("mailto:x@y.z", "darwin")).toEqual({
      command: "open",
      args: ["mailto:x@y.z"],
    });
    expect(openerCommand("mailto:x@y.z", "win32").command).toBe("rundll32");
    expect(openerCommand("mailto:x@y.z", "linux")).toEqual({
      command: "xdg-open",
      args: ["mailto:x@y.z"],
    });
  });
});
