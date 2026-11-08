// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useEffect, useRef } from "react";
import {
  FOCUSABLE_SELECTOR,
  isDismissButtonText,
  wrapFocusIndex,
} from "@/lib/dialog-a11y";

/**
 * DialogA11y gives every modal in the app the keyboard behaviour a modal owes
 * its users: Escape dismisses it, and Tab / Shift+Tab cycle inside it instead
 * of walking into the page behind it (OS-27).
 *
 * It is mounted once in the root layout and works on the shared markup every
 * dialog already uses — `.dialog-backdrop > .dialog[role="dialog"][aria-modal="true"]`
 * — so no dialog had to grow its own copy of this logic.
 */

function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute("hidden")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return el.getClientRects().length > 0;
}

/** The topmost open modal, or null when none is open. */
function openDialog(): HTMLElement | null {
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
  ).filter(isVisible);
  return dialogs.length ? dialogs[dialogs.length - 1] : null;
}

/**
 * Focusable items of a dialog, in tab order. A custom `Select` renders its
 * listbox in a portal on `<body>`, outside the dialog, so an open popover's
 * options are added while it is on screen.
 */
function focusableItems(dialog: HTMLElement): HTMLElement[] {
  const items = Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(isVisible);
  document
    .querySelectorAll<HTMLElement>(".custom-select-popover")
    .forEach((popover) =>
      items.push(
        ...Array.from(
          popover.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter(isVisible)
      )
    );
  return items;
}

/**
 * Escape closes a dialog the same way a click would, so the React state that
 * owns it is cleared through the component's own handler rather than by
 * reaching into it.
 */
function dismissDialog(dialog: HTMLElement): void {
  const close = dialog.querySelector<HTMLElement>('[aria-label="Close"]');
  if (close && isVisible(close) && !(close as HTMLButtonElement).disabled) {
    close.click();
    return;
  }
  const cancel = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>("button")
  ).find(
    (button) => !button.disabled && isDismissButtonText(button.textContent || "")
  );
  if (cancel) {
    cancel.click();
    return;
  }
  // No explicit control: the shared backdrop handler is "click outside to
  // dismiss".
  const backdrop = dialog.closest<HTMLElement>(".dialog-backdrop");
  backdrop?.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true })
  );
}

export default function DialogA11y() {
  const lastFocused = useRef<HTMLElement | null>(null);
  const activeDialog = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const dialog = openDialog();
      if (dialog === activeDialog.current) return;

      if (activeDialog.current && !dialog) {
        // The modal closed: hand focus back to whatever opened it.
        const restore = lastFocused.current;
        lastFocused.current = null;
        activeDialog.current = null;
        if (restore && document.contains(restore)) restore.focus();
        return;
      }

      if (dialog) {
        lastFocused.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        activeDialog.current = dialog;
        // Move focus in unless the dialog already claimed it (autoFocus).
        if (!dialog.contains(document.activeElement)) {
          focusableItems(dialog)[0]?.focus();
        }
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();

    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = openDialog();
      if (!dialog) return;

      if (event.key === "Escape") {
        // An open combobox closes itself on Escape; let it handle that first.
        if (document.querySelector(".custom-select-popover")) return;
        event.preventDefault();
        event.stopPropagation();
        dismissDialog(dialog);
        return;
      }

      if (event.key !== "Tab") return;
      const items = focusableItems(dialog);
      const active = document.activeElement;
      const current = active instanceof HTMLElement ? items.indexOf(active) : -1;
      const target = wrapFocusIndex(items.length, current, event.shiftKey);
      if (target === null) return;
      event.preventDefault();
      items[target].focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return null;
}
