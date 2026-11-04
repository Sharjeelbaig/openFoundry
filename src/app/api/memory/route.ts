// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  getMemoryItems,
  getMemoryStores,
  newId,
  nowIso,
  saveMemoryItems,
  saveMemoryStores,
} from "@/lib/store";
import { MemoryKind, MemoryItem, MemoryStore, MemoryFeatures } from "@/lib/types";
import { detectEmbeddingModel } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FEATURES: MemoryFeatures = {
  chatSummary: true,
  proceduralMemory: true,
  userProfile: true,
};

export async function GET() {
  const [stores, items, defaultEmbeddingModel] = await Promise.all([
    getMemoryStores(),
    getMemoryItems(),
    detectEmbeddingModel(),
  ]);
  return NextResponse.json({ stores, items, defaultEmbeddingModel });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    name?: string;
    description?: string;
    chatModel?: string;
    chatModelSku?: string;
    embeddingModel?: string;
    embeddingModelSku?: string;
    features?: Partial<MemoryFeatures>;
    userProfileDetails?: string;
    ttlSeconds?: number;
    itemId?: string;
    scope?: string;
    kind?: MemoryKind;
    key?: string;
    value?: string;
  };

  const stores = await getMemoryStores();

  if (body.action === "create" || (!body.action && body.name)) {
    const name = (body.name || "memory-store").trim();
    if (stores.some((store) => store.name === name))
      return NextResponse.json(
        { error: `A memory store named “${name}” already exists.` },
        { status: 409 }
      );
    const store: MemoryStore = {
      id: newId("memstore"),
      name,
      description: body.description?.trim() || "",
      chatModel: body.chatModel || "gpt-5",
      chatModelSku: body.chatModelSku || "Global Standard deployment",
      embeddingModel: body.embeddingModel || "text-embedding-3-small",
      embeddingModelSku: body.embeddingModelSku || "Standard deployment",
      features: { ...DEFAULT_FEATURES, ...(body.features || {}) },
      userProfileDetails: body.userProfileDetails || "",
      ttlSeconds: Number(body.ttlSeconds ?? 0) || 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    stores.push(store);
    await saveMemoryStores(stores);
    return NextResponse.json({ store }, { status: 201 });
  }

  const store = stores.find((entry) => entry.id === body.id);
  if (!store)
    return NextResponse.json({ error: "Memory store not found" }, { status: 404 });

  if (body.action === "update") {
    if (body.name) store.name = body.name.trim();
    if (body.description !== undefined) store.description = body.description;
    if (body.chatModel) store.chatModel = body.chatModel;
    if (body.chatModelSku) store.chatModelSku = body.chatModelSku;
    if (body.embeddingModel) store.embeddingModel = body.embeddingModel;
    if (body.embeddingModelSku) store.embeddingModelSku = body.embeddingModelSku;
    if (body.features) store.features = { ...store.features, ...body.features };
    if (body.userProfileDetails !== undefined)
      store.userProfileDetails = body.userProfileDetails;
    if (body.ttlSeconds !== undefined)
      store.ttlSeconds = Number(body.ttlSeconds) || 0;
    store.updatedAt = nowIso();
    await saveMemoryStores(stores);
    return NextResponse.json({ store });
  }

  if (body.action === "delete") {
    await saveMemoryStores(stores.filter((entry) => entry.id !== store.id));
    const items = await getMemoryItems();
    await saveMemoryItems(items.filter((item) => item.storeId !== store.id));
    return NextResponse.json({ ok: true });
  }

  if (body.action === "clear") {
    const items = await getMemoryItems();
    await saveMemoryItems(items.filter((item) => item.storeId !== store.id));
    return NextResponse.json({ ok: true });
  }

  if (body.action === "addItem") {
    if (!body.value?.trim())
      return NextResponse.json({ error: "A value is required" }, { status: 400 });
    const items = await getMemoryItems();
    const now = nowIso();
    const item: MemoryItem = {
      id: newId("mem"),
      storeId: store.id,
      scope: body.scope || "local-user",
      kind: body.kind || "user-profile",
      key: body.key,
      value: body.value.trim(),
      createdAt: now,
      updatedAt: now,
      expiresAt:
        store.ttlSeconds > 0
          ? new Date(Date.now() + store.ttlSeconds * 1000).toISOString()
          : undefined,
    };
    items.push(item);
    await saveMemoryItems(items);
    return NextResponse.json({ item }, { status: 201 });
  }

  if (body.action === "deleteItem") {
    const items = await getMemoryItems();
    await saveMemoryItems(items.filter((item) => item.id !== body.itemId));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
