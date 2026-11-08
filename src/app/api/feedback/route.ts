// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import {
  FEEDBACK_MAX_LENGTH,
  buildFeedbackMailto,
  openerCommand,
} from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands a feedback draft to the desktop mail client.
 *
 * The desktop window loads the UI from the local Next server, so the browser
 * side has no dependable way to hand `mailto:` to the OS: a WebView drops the
 * navigation, and the Tauri opener only answers whether the launcher started,
 * not whether a mail client accepted the draft. The server runs on the same
 * machine as the user, so it can launch the real handler and report its exit
 * status instead of claiming success it cannot see.
 */

const LAUNCH_TIMEOUT_MS = 8000;

// A page in a browser can post here too, so keep one draft at a time.
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
      const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
      const timer = setTimeout(() => {
        child.kill();
        finish({ ok: false, error: "The mail client did not answer in time." });
      }, LAUNCH_TIMEOUT_MS);
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        finish({ ok: false, error: error.message });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        finish(
          code === 0
            ? { ok: true }
            : {
                ok: false,
                error: stderr.trim() || `The mail client exited with code ${code}.`,
              }
        );
      });
    } catch (error) {
      finish({
        ok: false,
        error: error instanceof Error ? error.message : "Could not start the mail client.",
      });
    }
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "Write something first." }, { status: 400 });
  }
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `Keep feedback under ${FEEDBACK_MAX_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const now = Date.now();
  if (now - lastLaunchAt < 5000) {
    return NextResponse.json(
      { ok: false, error: "A draft just opened. Check your mail app." },
      { status: 429 }
    );
  }
  lastLaunchAt = now;

  const { command, args } = openerCommand(buildFeedbackMailto(message));
  const result = await launch(command, args);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
