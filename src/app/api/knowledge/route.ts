import { NextRequest, NextResponse } from "next/server";
import {
  getAgents,
  getKnowledgeBases,
  newId,
  nowIso,
  saveAgents,
  saveKnowledgeBases,
} from "@/lib/store";
import { chunkText, indexKnowledgeBase } from "@/lib/rag";
import { KnowledgeBase, KnowledgeDocument } from "@/lib/types";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".pdf")) {
    const temp = path.join(os.tmpdir(), `foundry-local-${Date.now()}.pdf`);
    await fs.writeFile(temp, buffer);
    try {
      const { stdout } = await execFileAsync("pdftotext", [temp, "-"], {
        maxBuffer: 16 * 1024 * 1024,
      });
      return stdout;
    } catch {
      throw new Error(
        "PDF text extraction needs the `pdftotext` utility (brew install poppler). Text, Markdown, CSV, JSON and HTML files work out of the box."
      );
    } finally {
      await fs.unlink(temp).catch(() => undefined);
    }
  }
  if (name.endsWith(".docx")) {
    throw new Error(
      "DOCX upload is not supported yet. Save the document as .txt, .md or .pdf and upload it again."
    );
  }
  if (
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp") ||
    name.endsWith(".zip") ||
    name.endsWith(".bin")
  ) {
    throw new Error("Upload a text-bearing document (txt, md, csv, json, html, pdf).");
  }
  return buffer.toString("utf8");
}

export async function GET() {
  const knowledgeBases = await getKnowledgeBases();
  return NextResponse.json({ knowledgeBases });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  const bases = await getKnowledgeBases();

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const baseId = String(form.get("knowledgeBaseId") || "");
    const base = bases.find((item) => item.id === baseId);
    if (!base)
      return NextResponse.json(
        { error: "Knowledge base not found" },
        { status: 404 }
      );
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0)
      return NextResponse.json({ error: "No files supplied" }, { status: 400 });
    const documents: KnowledgeDocument[] = [];
    for (const file of files) {
      const text = await extractText(file);
      const chunks = chunkText(text);
      if (chunks.length === 0) continue;
      documents.push({
        id: newId("doc"),
        name: file.name,
        size: file.size,
        type: file.type || "text/plain",
        text,
        chunks,
        addedAt: nowIso(),
      });
    }
    if (documents.length === 0)
      return NextResponse.json(
        { error: "No readable text found in those files" },
        { status: 400 }
      );
    base.documents.push(...documents);
    base.status = "Indexing";
    await saveKnowledgeBases(bases);
    await indexKnowledgeBase(base);
    await saveKnowledgeBases(bases);
    return NextResponse.json({ knowledgeBase: base, documents });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    name?: string;
    description?: string;
    text?: string;
    documentId?: string;
  };

  if (body.action === "create" || (!body.action && body.name)) {
    const base: KnowledgeBase = {
      id: newId("kb"),
      name: body.name || "knowledge-base",
      description:
        body.description ||
        "Local knowledge base indexed on this computer with vector search.",
      indexName: `${(body.name || "knowledge-base")
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")}-index`,
      embeddingModel: "detecting…",
      embeddingProvider: "lexical",
      status: "Ready",
      documents: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    bases.push(base);
    await saveKnowledgeBases(bases);
    return NextResponse.json({ knowledgeBase: base }, { status: 201 });
  }

  const base = bases.find((item) => item.id === body.id);
  if (!base)
    return NextResponse.json(
      { error: "Knowledge base not found" },
      { status: 404 }
    );

  if (body.action === "addText") {
    if (!body.text?.trim())
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    const doc: KnowledgeDocument = {
      id: newId("doc"),
      name: body.name || "pasted-text.txt",
      size: Buffer.byteLength(body.text),
      type: "text/plain",
      text: body.text,
      chunks: chunkText(body.text),
      addedAt: nowIso(),
    };
    base.documents.push(doc);
    base.status = "Indexing";
    await saveKnowledgeBases(bases);
    await indexKnowledgeBase(base);
    await saveKnowledgeBases(bases);
    return NextResponse.json({ knowledgeBase: base, document: doc });
  }

  if (body.action === "deleteDocument") {
    base.documents = base.documents.filter(
      (doc) => doc.id !== body.documentId
    );
    base.updatedAt = nowIso();
    await saveKnowledgeBases(bases);
    return NextResponse.json({ knowledgeBase: base });
  }

  if (body.action === "reindex") {
    base.status = "Indexing";
    await saveKnowledgeBases(bases);
    await indexKnowledgeBase(base);
    await saveKnowledgeBases(bases);
    return NextResponse.json({ knowledgeBase: base });
  }

  if (body.action === "rename") {
    base.name = body.name || base.name;
    base.description = body.description ?? base.description;
    base.updatedAt = nowIso();
    await saveKnowledgeBases(bases);
    return NextResponse.json({ knowledgeBase: base });
  }

  if (body.action === "delete") {
    const next = bases.filter((item) => item.id !== base.id);
    await saveKnowledgeBases(next);
    const agents = await getAgents();
    let changed = false;
    const nextAgents = agents.map((agent) => {
      if (!agent.knowledgeBaseIds.includes(base.id)) return agent;
      changed = true;
      return {
        ...agent,
        knowledgeBaseIds: agent.knowledgeBaseIds.filter((id) => id !== base.id),
        updatedAt: nowIso(),
      };
    });
    if (changed) await saveAgents(nextAgents);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
