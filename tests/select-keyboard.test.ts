// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  firstEnabledIndex,
  initialActiveIndex,
  lastEnabledIndex,
  stepEnabledIndex,
  type SelectOptionState,
} from "@/lib/select-keyboard";

const opt = (value: string, disabled = false): SelectOptionState => ({
  value,
  disabled,
});

describe("custom select keyboard navigation", () => {
  it("finds the first and last selectable options", () => {
    const options = [opt("a", true), opt("b"), opt("c"), opt("d", true)];
    expect(firstEnabledIndex(options)).toBe(1);
    expect(lastEnabledIndex(options)).toBe(2);
  });

  it("reports -1 when every option is disabled", () => {
    const options = [opt("a", true), opt("b", true)];
    expect(firstEnabledIndex(options)).toBe(-1);
    expect(lastEnabledIndex(options)).toBe(-1);
    expect(stepEnabledIndex(options, 0, 1)).toBe(0);
  });

  it("moves down and up, skipping disabled options", () => {
    const options = [opt("a"), opt("b", true), opt("c")];
    expect(stepEnabledIndex(options, 0, 1)).toBe(2);
    expect(stepEnabledIndex(options, 2, -1)).toBe(0);
  });

  it("wraps around the ends in both directions", () => {
    const options = [opt("a"), opt("b"), opt("c")];
    expect(stepEnabledIndex(options, 2, 1)).toBe(0);
    expect(stepEnabledIndex(options, 0, -1)).toBe(2);
  });

  it("enters the list at the right end when nothing is active", () => {
    const options = [opt("a", true), opt("b"), opt("c", true)];
    expect(stepEnabledIndex(options, -1, 1)).toBe(1);
    expect(stepEnabledIndex(options, -1, -1)).toBe(1);
  });

  it("returns -1 for an empty list", () => {
    expect(stepEnabledIndex([], -1, 1)).toBe(-1);
  });

  it("opens on the current selection, else the first enabled option", () => {
    const options = [opt("a", true), opt("b"), opt("c")];
    expect(initialActiveIndex(options, "c")).toBe(2);
    expect(initialActiveIndex(options, "a")).toBe(1);
    expect(initialActiveIndex(options, "missing")).toBe(1);
    expect(initialActiveIndex(options, undefined)).toBe(1);
  });
});
