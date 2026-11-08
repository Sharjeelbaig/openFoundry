// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

/**
 * Application-wide right-click policy.
 *
 * The webview's stock menu (Reload, Back, Inspect) is never useful inside a
 * desktop app and it leaks browser chrome. This component gives every screen
 * the same rule:
 *
 *   - writable fields keep the platform menu, because Cut/Copy/Paste and the
 *     spell checker live there and cannot be reimplemented faithfully;
 *   - a real text selection keeps the platform menu, so Copy works as users
 *     expect;
 *   - chat messages, YAML views, logs and code blocks get a compact Copy
 *     action with the text already resolved;
 *   - everywhere else the menu is suppressed. Lists, cards, canvases, charts
 *     and toolbars have no browser action, so no menu is the honest result.
 *
 * Keep this list in sync with docs/designs/right-click-behaviour.md.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy20Regular } from "@fluentui/react-icons";

interface MenuState {
  x: number;
  y: number;
  text: string;
  label: string;
}

const COPY_SELECTOR = [
  ".chat-bubble",
  ".yaml-view",
  ".code-block",
  "pre",
  "code",
  ".trace-payload",
  ".log-line",
].join(",");

function isEditable(target: Element | null): boolean {
  if (!target) return false;
  const field = target.closest("input, textarea, select, [contenteditable='true']");
  return Boolean(field);
}

export default function AppContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as Element | null;

      // Native editing and selection menus stay available.
      if (isEditable(target)) return;
      if ((window.getSelection()?.toString() || "").trim()) return;

      // From here on the browser menu is suppressed for every screen.
      event.preventDefault();

      const host = target?.closest<HTMLElement>(COPY_SELECTOR);
      if (!host) return;

      const text = (host.innerText || host.textContent || "").trim();
      if (!text) return;

      const width = 190;
      const height = 40;
      setMenu({
        x: Math.min(event.clientX, window.innerWidth - width - 8),
        y: Math.min(event.clientY, window.innerHeight - height - 8),
        text,
        label: host.classList.contains("chat-bubble") ? "Copy message" : "Copy",
      });
    };

    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [close]);

  if (!menu) return null;

  const copy = async () => {
    const text = menu.text;
    close();
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Clipboard API is unavailable on an insecure origin or denied. Fall
      // back to the old selection trick so Copy still works.
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } finally {
        area.remove();
      }
    }
  };

  return (
    <div
      ref={menuRef}
      className="menu-popover app-context-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
    >
      <button type="button" className="menu-item" role="menuitem" onClick={() => void copy()}>
        <Copy20Regular />
        {menu.label}
      </button>
    </div>
  );
}
