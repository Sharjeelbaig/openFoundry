// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { isProjectKey, unauthorized } from "@/lib/auth";
import {
  ConversationItem,
  appendConversationItems,
  listConversationItems,
  messageItem,
} from "@/lib/conversations";
import { newId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ project: string; id: string }>;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part)
          return String((part as { text?: unknown }).text ?? "");
        return "";
      })
      .join("");
  }
  return "";
}

/** Accepts the OpenAI input items a client can append and normalises them. */
function toStoredItem(raw: unknown): ConversationItem | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const item = raw as {
    type?: string;
    role?: string;
    content?: unknown;
    call_id?: string;
    output?: unknown;
    name?: string;
    arguments?: string;
  };
  const now = Math.floor(Date.now() / 1000);

  if (item.type === "function_call_output" && item.call_id) {
    return {
      id: newId("fco"),
      object: "conversation.item",
      type: "function_call_output",
      created_at: now,
      status: "completed",
      call_id: item.call_id,
      output: textOf(item.output),
    };
  }
  if (item.type === "function_call" && item.call_id && item.name) {
    return {
      id: newId("fc"),
      object: "conversation.item",
      type: "function_call",
      created_at: now,
      status: "completed",
      call_id: item.call_id,
      name: item.name,
      arguments: item.arguments || "{}",
    };
  }
  const role = item.role === "assistant" ? "assistant" : "user";
  const text = textOf(item.content);
  if (!text) return undefined;
  return messageItem(role, text);
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isProjectKey(req))) return unauthorized();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { items?: unknown[] };
  const stored = (body.items || [])
    .map(toStoredItem)
    .filter((item): item is ConversationItem => Boolean(item));

  const conversation = await appendConversationItems(id, stored);
  if (!conversation)
    return NextResponse.json(
      { error: { message: `Conversation ${id} not found`, type: "not_found" } },
      { status: 404 }
    );

  return NextResponse.json({
    object: "list",
    data: stored,
    first_id: stored[0]?.id || null,
    last_id: stored[stored.length - 1]?.id || null,
    has_more: false,
  });
}

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await isProjectKey(req))) return unauthorized();
  const { id } = await params;
  const limit = Number(req.nextUrl.searchParams.get("limit") || 0);
  const items = await listConversationItems(id, limit || undefined);
  if (!items)
    return NextResponse.json(
      { error: { message: `Conversation ${id} not found`, type: "not_found" } },
      { status: 404 }
    );
  return NextResponse.json({
    object: "list",
    data: items,
    first_id: items[0]?.id || null,
    last_id: items[items.length - 1]?.id || null,
    has_more: false,
  });
}
