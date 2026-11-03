import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/directory/audit";
import {
  accessControllerCount,
  can,
  projectScope,
  ROOT_SCOPE,
  scopeContains,
  summaryFor,
} from "@/lib/directory/can";
import { roleById } from "@/lib/directory/roles";
import { currentSession } from "@/lib/directory/server";
import { getDirectory, mutateDirectory } from "@/lib/directory/store";
import type { Assignment } from "@/lib/directory/types";
import { getSettings, nowIso } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AssignmentRow extends Assignment {
  name: string;
  email: string;
  initials: string;
  roleName: string;
  accessType: "Direct access" | "Inherited access";
}

async function scopes(): Promise<{ root: string; project: string }> {
  const settings = await getSettings();
  return { root: ROOT_SCOPE, project: projectScope(settings.projectId) };
}

export async function GET() {
  const [directory, bounds, settings, session] = await Promise.all([
    getDirectory(),
    scopes(),
    getSettings(),
    currentSession(),
  ]);
  const rows: AssignmentRow[] = [];
  for (const assignment of directory.assignments) {
    if (!scopeContains(assignment.scope, bounds.project)) continue;
    const principal = directory.principals.find(
      (item) => item.id === assignment.principalId
    );
    const role = roleById(assignment.roleId);
    if (!principal || !role) continue;
    rows.push({
      ...assignment,
      name: principal.name,
      email: principal.email,
      initials: principal.initials,
      roleName: role.name,
      accessType:
        assignment.scope === bounds.project ? "Direct access" : "Inherited access",
    });
  }
  rows.sort((left, right) => left.name.localeCompare(right.name));
  const summary = session
    ? summaryFor(directory, session.principal.id, bounds.project)
    : { roleName: "No role", access: "No access" };
  return NextResponse.json({
    assignments: rows,
    me: {
      roleName: summary.roleName,
      access: summary.access,
      email: session?.principal.email ?? "",
      canManage: session
        ? can(directory, session.principal.id, "directory.write", bounds.project).allowed
        : false,
      canManageRoot: session
        ? can(directory, session.principal.id, "directory.write", ROOT_SCOPE).allowed
        : false,
      canEditSettings: session
        ? can(directory, session.principal.id, "settings.write", ROOT_SCOPE).allowed
        : false,
    },
    scopeLabels: { root: settings.resourceName, project: settings.projectName },
    scopes: { root: bounds.root, project: bounds.project },
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    roleId?: string;
    scope?: string;
    principalIds?: string[];
    description?: string;
  };
  const bounds = await scopes();
  const role = body.roleId ? roleById(body.roleId) : undefined;
  if (!role) return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  const scope = body.scope === bounds.root ? bounds.root : bounds.project;
  const session = await currentSession();
  if (scope === bounds.root) {
    const directory = await getDirectory();
    if (
      !session ||
      !can(directory, session.principal.id, "directory.write", ROOT_SCOPE).allowed
    ) {
      return NextResponse.json(
        {
          error:
            "Only an owner of this install can assign access for the whole install.",
        },
        { status: 403 }
      );
    }
  }

  const actorId = session?.principal.id ?? "system";
  const principalIds = [...new Set(body.principalIds ?? [])].filter(Boolean);
  if (principalIds.length === 0) {
    return NextResponse.json({ error: "Select at least one member." }, { status: 400 });
  }

  const created = await mutateDirectory((directory) => {
    const rows: AssignmentRow[] = [];
    for (const principalId of principalIds) {
      const principal = directory.principals.find(
        (item) => item.id === principalId && !item.disabledAt
      );
      if (!principal) continue;
      const existing = directory.assignments.find(
        (item) =>
          item.principalId === principalId &&
          item.roleId === role.id &&
          item.scope === scope
      );
      if (existing) continue;
      const assignment: Assignment = {
        id: `asg_${randomUUID().slice(0, 8)}`,
        principalId,
        roleId: role.id,
        scope,
        description: body.description?.trim() || undefined,
        createdAt: nowIso(),
        createdBy: actorId,
      };
      directory.assignments.push(assignment);
      rows.push({
        ...assignment,
        name: principal.name,
        email: principal.email,
        initials: principal.initials,
        roleName: role.name,
        accessType: scope === bounds.project ? "Direct access" : "Inherited access",
      });
    }
    return rows;
  });

  for (const row of created) {
    void appendAudit({
      actorId: row.createdBy,
      action: "assignment.create",
      target: row.id,
      scope: row.scope,
      outcome: "allowed",
      detail: `${row.roleName} for ${row.email}`,
    });
  }

  return NextResponse.json({ assignments: created }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await currentSession();
  const existing = await getDirectory();
  const target = existing.assignments.find((item) => item.id === id);
  if (!target) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }
  if (
    !session ||
    !can(existing, session.principal.id, "directory.write", target.scope).allowed
  ) {
    return NextResponse.json(
      { error: "You cannot change an assignment at this scope." },
      { status: 403 }
    );
  }

  const actorId = session.principal.id;
  const result = await mutateDirectory((directory) => {
    const target = directory.assignments.find((item) => item.id === id);
    if (!target) return { ok: false as const, reason: "missing" };
    const next = directory.assignments.filter((item) => item.id !== id);
    const probe = { ...directory, assignments: next };
    if (accessControllerCount(probe) === 0) {
      return { ok: false as const, reason: "last_owner" };
    }
    directory.assignments = next;
    return { ok: true as const, target };
  });

  if (!result.ok) {
    if (result.reason === "missing") {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "This install must keep at least one person who can change access." },
      { status: 400 }
    );
  }

  void appendAudit({
    actorId,
    action: "assignment.delete",
    target: id,
    scope: result.target.scope,
    outcome: "allowed",
  });

  return NextResponse.json({ ok: true });
}
