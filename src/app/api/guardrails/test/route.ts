// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getBlocklists, getGuardrails } from "@/lib/store";
import { type InterventionPoint } from "@/lib/guardrails";
import { evaluateWithModel } from "@/lib/guardrail-semantic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dry-run a guardrail against text without calling a model. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    guardrailId?: string;
    text?: string;
    point?: InterventionPoint;
  };
  if (!body.guardrailId || !body.text?.trim()) {
    return NextResponse.json(
      { error: "guardrailId and text are required." },
      { status: 400 }
    );
  }
  const point =
    body.point === "output" || body.point === "tool"
      ? body.point
      : "input";
  const [guardrails, blocklists] = await Promise.all([
    getGuardrails(),
    getBlocklists(),
  ]);
  const guardrail = guardrails.find((entry) => entry.id === body.guardrailId);
  if (!guardrail) {
    return NextResponse.json({ error: "Guardrail not found." }, { status: 404 });
  }
  const verdict = await evaluateWithModel(
    guardrail,
    blocklists,
    body.text,
    point
  );
  return NextResponse.json({
    blocked: verdict.blocked,
    reason: verdict.reason || null,
    text: verdict.text,
    findings: verdict.findings,
    semantic: verdict.semantic || null,
    control: verdict.control
      ? {
          id: verdict.control.id,
          riskType: verdict.control.riskType,
          action: verdict.control.action,
        }
      : null,
  });
}
