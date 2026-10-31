import { NextRequest, NextResponse } from "next/server";
import { isProjectKey, unauthorized } from "@/lib/auth";
import { createConversation, listConversations } from "@/lib/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isProjectKey(req))) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    metadata?: Record<string, string>;
  };
  const conversation = await createConversation(body.metadata || {});
  return NextResponse.json({
    id: conversation.id,
    object: conversation.object,
    created_at: conversation.created_at,
    metadata: conversation.metadata,
  });
}

export async function GET(req: NextRequest) {
  if (!(await isProjectKey(req))) return unauthorized();
  const conversations = await listConversations();
  return NextResponse.json({
    object: "list",
    data: conversations.map((conversation) => ({
      id: conversation.id,
      object: conversation.object,
      created_at: conversation.created_at,
      metadata: conversation.metadata,
    })),
    first_id: conversations[0]?.id || null,
    last_id: conversations[conversations.length - 1]?.id || null,
    has_more: false,
  });
}
