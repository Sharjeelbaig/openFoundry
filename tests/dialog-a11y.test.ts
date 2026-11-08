// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  FOCUSABLE_SELECTOR,
  isDismissButtonText,
  wrapFocusIndex,
} from "../src/lib/dialog-a11y";

describe("wrapFocusIndex", () => {
  it("returns null for an empty list", () => {
    expect(wrapFocusIndex(0, -1, false)).toBeNull();
    expect(wrapFocusIndex(0, 0, true)).toBeNull();
  });

  it("enters the list from outside focus", () => {
    expect(wrapFocusIndex(3, -1, false)).toBe(0);
    expect(wrapFocusIndex(3, -1, true)).toBe(2);
    expect(wrapFocusIndex(3, 9, false)).toBe(0);
  });

  it("wraps forward from the last item and backward from the first", () => {
    expect(wrapFocusIndex(3, 2, false)).toBe(0);
    expect(wrapFocusIndex(3, 0, true)).toBe(2);
  });

  it("leaves the default behaviour alone in the middle of the list", () => {
    expect(wrapFocusIndex(3, 0, false)).toBeNull();
    expect(wrapFocusIndex(3, 1, false)).toBeNull();
    expect(wrapFocusIndex(3, 1, true)).toBeNull();
    expect(wrapFocusIndex(3, 2, true)).toBeNull();
  });
});

describe("isDismissButtonText", () => {
  it("recognises the words that dismiss a dialog", () => {
    for (const text of ["Cancel", "Close", "No", "Dismiss", "Back", " Not now "]) {
      expect(isDismissButtonText(text)).toBe(true);
    }
  });

  it("does not treat a committing action as a dismissal", () => {
    for (const text of ["Delete", "Save", "Add and index", "Cancel upload", ""]) {
      expect(isDismissButtonText(text)).toBe(false);
    }
  });
});

describe("FOCUSABLE_SELECTOR", () => {
  it("excludes disabled controls and non-tabbable elements", () => {
    expect(FOCUSABLE_SELECTOR).toContain(":not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
