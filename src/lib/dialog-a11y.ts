// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Pure helpers behind `DialogA11y`, kept free of the DOM so they can be unit
 * tested in the node test environment.
 */

/** Elements that can take keyboard focus inside a dialog, in tab order. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * The words that mark a control as dismissing the dialog. Used as the Escape
 * fallback when a dialog has no explicit `aria-label="Close"` control.
 */
const DISMISS_TEXT = /^(cancel|no|close|dismiss|back|not now|skip)$/i;

export function isDismissButtonText(text: string): boolean {
  return DISMISS_TEXT.test(text.trim());
}

/**
 * Where Tab (or Shift+Tab) should land, wrapping at both ends of the list so
 * focus cannot escape a modal. `current` is the focused item's index, or `-1`
 * when focus is outside the list.
 *
 * Returns `null` when the list is empty or when the browser's default Tab
 * already stays inside the list (so the caller leaves the keypress alone).
 */
export function wrapFocusIndex(
  count: number,
  current: number,
  shift: boolean
): number | null {
  if (count <= 0) return null;
  if (current < 0 || current >= count) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}
