// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { useCallback } from "react";

/**
 * External links in the desktop shell.
 *
 * The Tauri window loads the UI from the local Next server, not from a
 * `tauri://` origin. A plain `target="_blank"` is left to the WebView, which
 * either drops it or opens another app window; the Tauri opener is also not
 * guaranteed to have IPC access from that origin. The local server can launch
 * the OS handler reliably, so local and desktop sessions route through
 * `/api/open-external` and only fall back to the browser (or the opener plugin)
 * when that is unavailable.
 */

function hasTauriInternals(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (
      window as unknown as {
        __TAURI_INTERNALS__?: { invoke?: unknown };
      }
    ).__TAURI_INTERNALS__
  );
}

function isDesktopShell(): boolean {
  if (typeof document === "undefined") return false;
  return (
    hasTauriInternals() ||
    document.documentElement.dataset.desktop === "true"
  );
}

export async function openExternalUrl(
  url: string
): Promise<{ ok: boolean; error?: string }> {
  if (isDesktopShell()) {
    try {
      const response = await fetch("/api/open-external", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (response.ok && result.ok !== false) return { ok: true };
      if (hasTauriInternals()) {
        try {
          const { openUrl } = await import("@tauri-apps/plugin-opener");
          await openUrl(url);
          return { ok: true };
        } catch {
          // The server and the plugin both failed; try the WebView last.
        }
      }
      try {
        if (window.open(url, "_blank", "noopener,noreferrer")) {
          return { ok: true };
        }
      } catch {
        // Fall through to the server's message.
      }
      return {
        ok: false,
        error:
          result.error ||
          "The system could not open that link. Open it in your browser instead.",
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The system could not open that link.",
      };
    }
  }

  try {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    return opened
      ? { ok: true }
      : { ok: false, error: "The browser blocked the new tab." };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The browser blocked the new tab.",
    };
  }
}

export default function ExternalLink({
  href,
  children,
  onOpenError,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  onOpenError?: (message: string) => void;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onError">) {
  const onClick = useCallback(
    async (event: MouseEvent<HTMLAnchorElement>) => {
      // A normal browser keeps native link behavior: the platform opens a tab
      // with the user's own settings and extensions.
      if (!isDesktopShell()) return;
      event.preventDefault();
      const result = await openExternalUrl(href);
      if (!result.ok) {
        onOpenError?.(result.error || "Could not open that link.");
      }
    },
    [href, onOpenError]
  );

  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
