// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import {
  MemoryItem,
  MemoryKind,
  MemoryStore,
} from "./types";
import {
  getMemoryItems,
  getMemoryStores,
  newId,
  nowIso,
  saveMemoryItems,
} from "./store";

/**
 * Local Memory engine.
 *
 * Mirrors the job Foundry's Memory stores do for an agent: after a turn the
 * store extracts durable facts (chat summary, procedural habits, user profile)
 * and before a turn it recalls the most relevant ones and injects them into the
 * model's context. Everything is derived on this computer from the conversation
 * itself — no cloud round-trip.
 */

export async function getMemoryStore(id: string): Promise<MemoryStore | undefined> {
  const stores = await getMemoryStores();
  return stores.find((store) => store.id === id);
}

function firstSentence(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = cut.search(/[.!?](\s|$)/);
  return (stop > 40 ? cut.slice(0, stop + 1) : cut).trim();
}

const PROFILE_PATTERNS: { key: string; re: RegExp; label: string }[] = [
  { key: "name", re: /\b(?:my name is|i am|i'm|call me)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/, label: "Name" },
  { key: "location", re: /\bi (?:live|work|am based) in\s+([A-Za-z .'-]{2,40})/i, label: "Location" },
  { key: "dietary", re: /\b(?:i(?:'m| am) (?:allergic to|vegan|vegetarian)|i (?:can't|cannot|don't) eat)\s+([A-Za-z ,.'-]{2,60})/i, label: "Dietary restrictions" },
  { key: "preference", re: /\bi (?:prefer|like|always want)\s+([A-Za-z0-9 ,.'-]{2,60})/i, label: "Preference" },
  { key: "role", re: /\bi (?:work as|am) (?:an?|the)\s+([A-Za-z ]{2,40})/i, label: "Role" },
];

const PROCEDURAL_RE =
  /\b(?:always|never|from now on|remember to|when I ask|whenever I|in future|going forward|make sure to)\b/i;

/** Extract durable facts from one conversation turn. Pure local heuristics. */
export function extractMemories(
  store: MemoryStore,
  userText: string,
  assistantText: string
): { kind: MemoryKind; key?: string; value: string }[] {
  const found: { kind: MemoryKind; key?: string; value: string }[] = [];

  if (store.features.chatSummary && (userText || assistantText)) {
    const summary = `User asked: ${firstSentence(userText, 160)}${
      assistantText ? ` — answer: ${firstSentence(assistantText, 200)}` : ""
    }`;
    found.push({ kind: "chat-summary", key: "latest", value: summary });
  }

  if (store.features.proceduralMemory && PROCEDURAL_RE.test(userText)) {
    found.push({ kind: "procedural", value: firstSentence(userText, 240) });
  }

  if (store.features.userProfile) {
    for (const pattern of PROFILE_PATTERNS) {
      const match = userText.match(pattern.re);
      if (match && match[1]) {
        found.push({
          kind: "user-profile",
          key: pattern.key,
          value: `${pattern.label}: ${match[1].trim().replace(/[.!,]+$/, "")}`,
        });
      }
    }
    // Explicitly blocked facts from the user-profile details instructions.
    const avoid = store.userProfileDetails?.match(/\bavoid\s+([^.]{3,80})/i);
    if (avoid) found.push({ kind: "user-profile", key: "avoid", value: `Avoid: ${avoid[1].trim()}` });
  }

  return found;
}

/** Persist extracted facts, respecting TTL and deduping profile slots. */
export async function rememberTurn(
  store: MemoryStore,
  scope: string,
  userText: string,
  assistantText: string
): Promise<MemoryItem[]> {
  const extracted = extractMemories(store, userText, assistantText);
  if (extracted.length === 0) return [];
  const items = await getMemoryItems();
  const now = nowIso();
  const expiresAt =
    store.ttlSeconds > 0
      ? new Date(Date.now() + store.ttlSeconds * 1000).toISOString()
      : undefined;
  const written: MemoryItem[] = [];

  for (const fact of extracted) {
    const key = fact.key;
    const existing = items.find(
      (item) =>
        item.storeId === store.id &&
        item.scope === scope &&
        item.kind === fact.kind &&
        (item.key || undefined) === key
    );
    if (existing) {
      existing.value = fact.value;
      existing.updatedAt = now;
      existing.expiresAt = expiresAt;
      written.push(existing);
    } else {
      const item: MemoryItem = {
        id: newId("mem"),
        storeId: store.id,
        scope,
        kind: fact.kind,
        key,
        value: fact.value,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      };
      items.push(item);
      written.push(item);
    }
  }
  await saveMemoryItems(items);
  const stores = await getMemoryStores();
  const target = stores.find((entry) => entry.id === store.id);
  if (target) {
    target.lastUsedAt = now;
    target.updatedAt = now;
  }
  return written;
}

function score(query: string, value: string): number {
  const q = query.toLowerCase().match(/[a-z0-9']+/g) || [];
  const v = value.toLowerCase();
  if (q.length === 0) return 0.2;
  let hits = 0;
  for (const token of new Set(q)) {
    if (token.length > 2 && v.includes(token)) hits += 1;
  }
  return hits / Math.max(1, new Set(q).size);
}

/**
 * Recall the memories most relevant to the incoming message. Profile facts are
 * always included so the agent keeps a stable picture of the user.
 */
export async function recall(
  store: MemoryStore,
  scope: string,
  query: string,
  limit = 8
): Promise<MemoryItem[]> {
  const all = await getMemoryItems();
  const now = Date.now();
  const live = all.filter(
    (item) =>
      item.storeId === store.id &&
      item.scope === scope &&
      (!item.expiresAt || Date.parse(item.expiresAt) > now)
  );
  const profile = live.filter((item) => item.kind === "user-profile");
  const rest = live
    .filter((item) => item.kind !== "user-profile")
    .map((item) => ({ item, s: score(query, item.value) }))
    .sort((a, b) => b.s - a.s)
    .filter((entry) => entry.s > 0)
    .slice(0, Math.max(0, limit - profile.length))
    .map((entry) => entry.item);
  return [...profile, ...rest].slice(0, limit);
}

/** Render recalled memories as a system-prompt block. */
export function renderMemory(items: MemoryItem[]): string {
  if (items.length === 0) return "";
  const lines = items.map((item) => `- ${item.value}`);
  return `Long-term memory about this user (persisted by the local Memory store; treat as trusted context):\n${lines.join(
    "\n"
  )}`;
}
