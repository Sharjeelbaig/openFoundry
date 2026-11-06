// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  createConnection,
  deleteConnection,
  listConnections,
  updateConnection,
  type ConnectionInput,
} from "@/lib/connections/store";
import type { ConnectionAuthType, ConnectionProvider } from "@/lib/connections/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Secrets are never returned; only whether one is set and a masked hint. */
export async function GET() {
  return NextResponse.json({ connections: await listConnections() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<ConnectionInput> & {
    provider?: ConnectionProvider;
    authType?: ConnectionAuthType;
  };
  try {
    const connection = await createConnection({
      name: body.name || "",
      provider: (body.provider || "s3") as ConnectionProvider,
      target: body.target || "",
      authType: (body.authType || "accessKey") as ConnectionAuthType,
      config: body.config,
      secret: body.secret,
    });
    return NextResponse.json({ connection }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
  } & Partial<ConnectionInput>;
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  try {
    const connection = await updateConnection(body.id, {
      name: body.name,
      target: body.target,
      config: body.config,
      secret: body.secret,
    });
    return NextResponse.json({ connection });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await deleteConnection(id);
  return NextResponse.json({ ok: true });
}
