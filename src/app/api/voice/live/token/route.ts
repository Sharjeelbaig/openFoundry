// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { isProjectKey } from "@/lib/auth";
import { currentSession } from "@/lib/directory/server";
import { getAgent, getAgents } from "@/lib/store";
import { issueVoiceToken } from "@/lib/voice-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issues a short-lived token for the loopback Voice Live WebSocket. */
export async function POST(req: NextRequest) {
  if (!(await isProjectKey(req)) && !(await currentSession())) {
    return NextResponse.json(
      { error: "A project API key or signed-in session is required." },
      { status: 401 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { agent?: string };
  const agent = body.agent ? await getAgent(body.agent) : (await getAgents())[0];
  if (!agent) {
    return NextResponse.json(
      { error: "No agent is configured on this install." },
      { status: 404 }
    );
  }
  const token = await issueVoiceToken(agent.id);
  const port = process.env.OPENFOUNDRY_VOICE_WS_PORT || "3002";
  const wsUrl =
    process.env.OPENFOUNDRY_VOICE_WS_URL ||
    `ws://127.0.0.1:${port}`;
  return NextResponse.json({ token, wsUrl, agent: agent.id });
}
