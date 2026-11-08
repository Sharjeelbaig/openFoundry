// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  addSource,
  cloneSourceIntoBase,
  createBase,
  deleteBase,
  deleteDocument,
  deleteSource,
  getBaseRecord,
  ingestPastedText,
  ingestUploads,
  legacyKnowledge,
  listSourceRecords,
  syncSource,
  updateBase,
} from "@/lib/knowledge/service";
import { normalizeSourceKind } from "@/lib/knowledge/create-sources";
import type {
  OutputMode,
  ReasoningEffort,
  SourceKind,
} from "@/lib/knowledge/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function legacyBase(knowledgeBases: Awaited<ReturnType<typeof legacyKnowledge>>["knowledgeBases"], id: string) {
  return knowledgeBases.find((base) => base.id === id);
}

async function stateFor(id: string) {
  const state = await legacyKnowledge();
  return { ...state, knowledgeBase: legacyBase(state.knowledgeBases, id) };
}

export async function GET() {
  return NextResponse.json(await legacyKnowledge());
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  // Uploads keep the existing multipart contract used by the UI.
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const baseId = String(form.get("knowledgeBaseId") || "");
    if (!(await getBaseRecord(baseId))) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }
    const files = form.getAll("files").filter((file): file is File => file instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files supplied" }, { status: 400 });
    }
    const payload = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        mime: file.type || "text/plain",
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    );
    const outcome = await ingestUploads(baseId, payload);
    const state = await stateFor(baseId);
    if (outcome.errors.length && outcome.documents === 0) {
      return NextResponse.json(
        { error: outcome.errors[0], job: outcome.job, knowledgeBase: state.knowledgeBase },
        { status: 400 }
      );
    }
    return NextResponse.json({
      knowledgeBase: state.knowledgeBase,
      job: outcome.job,
      errors: outcome.errors,
      documents: outcome.documents,
    });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    name?: string;
    description?: string;
    text?: string;
    documentId?: string;
    connectionId?: string;
    chatModel?: string;
    reasoningEffort?: ReasoningEffort;
    outputMode?: OutputMode;
    retrievalInstructions?: string;
    answerInstructions?: string;
    encryption?: { enabled: boolean; keyVault?: string; keyName?: string };
    sourceKind?: SourceKind;
    sourceId?: string;
    sourceName?: string;
    sourceDetail?: string;
    sourceConfig?: Record<string, unknown>;
    /** Source types chosen on the create page, attached at create time (OS-23). */
    sources?: {
      kind?: string;
      catalogKind?: string;
      name?: string;
      detail?: string;
      reuseOf?: string;
    }[];
  };

  try {
    if (body.action === "create" || (!body.action && body.name)) {
      if (!body.name?.trim()) {
        return NextResponse.json({ error: "A name is required" }, { status: 400 });
      }
      const existing = (await legacyKnowledge()).knowledgeBases.find(
        (base) => base.name.toLowerCase() === body.name!.trim().toLowerCase()
      );
      if (existing) {
        return NextResponse.json(
          { error: "A knowledge base with that name already exists" },
          { status: 409 }
        );
      }
      const base = await createBase({
        name: body.name,
        description: body.description,
        chatModel: body.chatModel,
        reasoningEffort: body.reasoningEffort,
        outputMode: body.outputMode,
        retrievalInstructions: body.retrievalInstructions,
        answerInstructions: body.answerInstructions,
        connectionId: body.connectionId,
        encryption: body.encryption,
      });

      // The create page only picks source *types*, but the base must record what
      // the user chose instead of dropping it (OS-23). Attach each one now:
      // reused sources are cloned, the rest are created directly. A source that
      // still needs a connection or extra configuration cannot be created here,
      // so it is reported back and the detail page finishes it through its
      // usual dialog.
      const pendingSources: SourceKind[] = [];
      const pendingReuse: string[] = [];
      for (const source of body.sources ?? []) {
        if (typeof source?.reuseOf === "string" && source.reuseOf) {
          try {
            await cloneSourceIntoBase(base.id, source.reuseOf);
          } catch {
            pendingReuse.push(source.reuseOf);
          }
          continue;
        }
        const kind = normalizeSourceKind(source?.kind, source?.catalogKind);
        if (!kind) continue;
        try {
          await addSource({
            baseId: base.id,
            kind,
            name: source?.name?.trim() || kind,
            description: source?.detail,
          });
        } catch {
          pendingSources.push(kind);
        }
      }

      const state = await stateFor(base.id);
      return NextResponse.json(
        { knowledgeBase: state.knowledgeBase, pendingSources, pendingReuse },
        { status: 201 }
      );
    }

    const baseId = body.id || "";
    if (!baseId || !(await getBaseRecord(baseId))) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }

    if (body.action === "addText") {
      if (!body.text?.trim()) {
        return NextResponse.json({ error: "Text is required" }, { status: 400 });
      }
      const outcome = await ingestPastedText(baseId, body.name || "pasted-text.txt", body.text);
      const state = await stateFor(baseId);
      if (outcome.errors.length && outcome.documents === 0) {
        return NextResponse.json(
          { error: outcome.errors[0], knowledgeBase: state.knowledgeBase },
          { status: 400 }
        );
      }
      return NextResponse.json({
        knowledgeBase: state.knowledgeBase,
        document: state.knowledgeBase?.documents.find((doc) => doc.name === (body.name || "pasted-text.txt")),
        job: outcome.job,
      });
    }

    if (body.action === "deleteDocument") {
      if (!body.documentId) {
        return NextResponse.json({ error: "documentId is required" }, { status: 400 });
      }
      await deleteDocument(baseId, body.documentId);
      const state = await stateFor(baseId);
      return NextResponse.json({ knowledgeBase: state.knowledgeBase });
    }

    if (body.action === "reindex") {
      const sources = await listSourceRecords(baseId);
      const indexed = sources.filter((source) => source.mode === "indexed");
      if (indexed.length === 0) {
        return NextResponse.json(
          { error: "This knowledge base has no indexed source to reindex." },
          { status: 400 }
        );
      }
      let last = null;
      for (const source of indexed) {
        last = await syncSource(baseId, source.id);
      }
      const state = await stateFor(baseId);
      return NextResponse.json({ knowledgeBase: state.knowledgeBase, job: last?.job });
    }

    if (body.action === "rename") {
      await updateBase(baseId, {
        name: body.name,
        description: body.description,
        connectionId: body.connectionId,
        chatModel: body.chatModel,
        reasoningEffort: body.reasoningEffort,
        outputMode: body.outputMode,
        retrievalInstructions: body.retrievalInstructions,
        answerInstructions: body.answerInstructions,
        encryption: body.encryption,
      });
      const state = await stateFor(baseId);
      return NextResponse.json({ knowledgeBase: state.knowledgeBase });
    }

    if (body.action === "addSource") {
      const kind = (body.sourceKind || "web") as SourceKind;
      const source = await addSource({
        baseId,
        kind,
        name: body.sourceName || kind,
        description: body.sourceDetail,
        config: body.sourceConfig || {},
        connectionId: body.connectionId,
      });
      const state = await stateFor(baseId);
      return NextResponse.json({ knowledgeBase: state.knowledgeBase, source });
    }

    if (body.action === "reuseSource") {
      if (!body.sourceId) {
        return NextResponse.json(
          { error: "sourceId is required" },
          { status: 400 }
        );
      }
      const source = await cloneSourceIntoBase(baseId, body.sourceId);
      const state = await stateFor(baseId);
      return NextResponse.json(
        { knowledgeBase: state.knowledgeBase, source },
        { status: 201 }
      );
    }

    if (body.action === "deleteSource") {
      if (!body.sourceId) {
        return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
      }
      await deleteSource(baseId, body.sourceId);
      const state = await stateFor(baseId);
      return NextResponse.json({ knowledgeBase: state.knowledgeBase });
    }

    if (body.action === "sync") {
      if (!body.sourceId) {
        return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
      }
      const outcome = await syncSource(baseId, body.sourceId);
      const state = await stateFor(baseId);
      return NextResponse.json({
        knowledgeBase: state.knowledgeBase,
        job: outcome.job,
        errors: outcome.errors,
      });
    }

    if (body.action === "delete") {
      await deleteBase(baseId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
