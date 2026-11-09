// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { openerCommand } from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens an http(s) URL with the operating system's default browser.
 *
 * The desktop window cannot hand this to the WebView reliably (it loads the UI
 * from a loopback Next server, not a Tauri origin), and a plain `window.open`
 * creates another app window instead of a browser tab. The server runs beside
 * the user, so the OS opener is the dependable path. Only http(s) is accepted,
 * and the URL is passed as an argument, never through a shell string.
 */

const LAUNCH_TIMEOUT_MS = 5000;
let lastLaunchAt = 0;

function launch(command: string, args: string[]) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    let settled = false;
    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const child = spawn(command, args, {
        stdio: "ignore",
        detached: process.platform !== "win32",
      });
      const timer = setTimeout(() => {
        child.unref();
        finish({ ok: true });
      }, LAUNCH_TIMEOUT_MS);
      child.on("error", (error) => {
        clearTimeout(timer);
        finish({ ok: false, error: error.message });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          child.unref();
          finish({ ok: true });
          return;
        }
        finish({
          ok: false,
          error: `The browser launcher exited with code ${code}.`,
        });
      });
    } catch (error) {
      finish({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not start the browser launcher.",
      });
    }
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  const raw = typeof body.url === "string" ? body.url.trim() : "";
  if (!raw || raw.length > 2048) {
    return NextResponse.json(
      { ok: false, error: "Give a valid http or https address." },
      { status: 400 }
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Give a valid http or https address." },
      { status: 400 }
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json(
      { ok: false, error: "Only http and https links can be opened." },
      { status: 400 }
    );
  }
  if (url.username || url.password) {
    return NextResponse.json(
      { ok: false, error: "Links with embedded credentials are not allowed." },
      { status: 400 }
    );
  }

  const now = Date.now();
  if (now - lastLaunchAt < 750) {
    return NextResponse.json(
      { ok: false, error: "A link just opened. Try again in a moment." },
      { status: 429 }
    );
  }
  lastLaunchAt = now;

  const { command, args } = openerCommand(url.toString());
  const result = await launch(command, args);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
