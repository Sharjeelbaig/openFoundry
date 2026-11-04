// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { newId, readJson, writeJson } from "./store";

/**
 * Conversations back the OpenAI Conversations API that Foundry agents use:
 * `conversations.create()` returns an id, then user turns and assistant outputs
 * are appended to it so a later `responses.create({ conversation })` still sees
 * the earlier turns.
 */
export interface ConversationItem {
  id: string;
  object: "conversation.item";
  type: "message" | "function_call" | "function_call_output";
  created_at: number;
  status: "completed" | "incomplete";
  role?: "user" | "assistant";
  content?: unknown[];
  /** function calls request a reply on this id; outputs answer it */
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
}

export interface Conversation {
  id: string;
  object: "conversation";
  created_at: number;
  metadata: Record<string, string>;
  items: ConversationItem[];
}

const FILE = "conversations.json";

export async function listConversations(): Promise<Conversation[]> {
  return readJson<Conversation[]>(FILE, []);
}

export async function getConversation(
  id: string
): Promise<Conversation | undefined> {
  const all = await listConversations();
  return all.find((conversation) => conversation.id === id);
}

export async function createConversation(
  metadata: Record<string, string> = {}
): Promise<Conversation> {
  const conversation: Conversation = {
    id: newId("conv"),
    object: "conversation",
    created_at: Math.floor(Date.now() / 1000),
    metadata,
    items: [],
  };
  const all = await listConversations();
  all.push(conversation);
  await writeJson(FILE, all.slice(-200));
  return conversation;
}

export async function appendConversationItems(
  id: string,
  items: ConversationItem[]
): Promise<Conversation | undefined> {
  const all = await listConversations();
  const conversation = all.find((entry) => entry.id === id);
  if (!conversation) return undefined;
  conversation.items.push(...items);
  await writeJson(FILE, all);
  return conversation;
}

export async function listConversationItems(
  id: string,
  limit?: number
): Promise<ConversationItem[] | undefined> {
  const conversation = await getConversation(id);
  if (!conversation) return undefined;
  if (!limit || limit >= conversation.items.length) return conversation.items;
  return conversation.items.slice(-limit);
}

export async function deleteConversation(id: string): Promise<boolean> {
  const all = await listConversations();
  const next = all.filter((conversation) => conversation.id !== id);
  if (next.length === all.length) return false;
  await writeJson(FILE, next);
  return true;
}

export function messageItem(
  role: "user" | "assistant",
  text: string
): ConversationItem {
  return {
    id: newId("msg"),
    object: "conversation.item",
    type: "message",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    role,
    content: [{ type: role === "user" ? "input_text" : "output_text", text }],
  };
}
