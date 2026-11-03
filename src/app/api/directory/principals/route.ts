import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/directory/audit";
import {
  generateAccessCode,
  hashSecret,
  newSalt,
  normalizeCode,
} from "@/lib/directory/codes";
import { accessControllerCount, projectScope, ROOT_SCOPE } from "@/lib/directory/can";
import { ROLE_FOUNDRY_USER, ROLE_READER, roleById } from "@/lib/directory/roles";
import { currentSession } from "@/lib/directory/server";
import { revokeSessionsFor } from "@/lib/directory/sessions";
import { getDirectory, mutateDirectory } from "@/lib/directory/store";
import type { Assignment, Credential, Principal } from "@/lib/directory/types";
import { getSettings, nowIso } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PrincipalRow {
  id: string;
  name: string;
  email: string;
  initials: string;
  createdAt: string;
  disabledAt?: string;
  roles: { roleId: string; roleName: string; scope: string }[];
  credential: {
    state: "active" | "never_used" | "none" | "revoked";
    lastUsedAt?: string;
    createdAt?: string;
  };
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function GET() {
  const directory = await getDirectory();
  const rows: PrincipalRow[] = directory.principals.map((principal) => {
    const credentials = directory.credentials.filter(
      (item) => item.principalId === principal.id && item.kind === "access_code"
    );
    const live = credentials.filter((item) => !item.revokedAt);
    const used = live.filter((item) => item.lastUsedAt);
    return {
      id: principal.id,
      name: principal.name,
      email: principal.email,
      initials: principal.initials,
      createdAt: principal.createdAt,
      disabledAt: principal.disabledAt,
      roles: directory.assignments
        .filter((item) => item.principalId === principal.id)
        .map((item) => ({
          roleId: item.roleId,
          roleName: roleById(item.roleId)?.name ?? "Unknown",
          scope: item.scope,
        })),
      credential: {
        state:
          live.length === 0
            ? credentials.length > 0
              ? "revoked"
              : "none"
            : used.length > 0
              ? "active"
              : "never_used",
        lastUsedAt: used.length > 0 ? used[0].lastUsedAt : undefined,
        createdAt: live[0]?.createdAt,
      },
    };
  });
  rows.sort((left, right) => left.name.localeCompare(right.name));
  return NextResponse.json({ principals: rows });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    roleIds?: string[];
    scope?: string;
  };
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!name) return NextResponse.json({ error: "Enter a name." }, { status: 400 });
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const settings = await getSettings();
  const project = projectScope(settings.projectId);
  const scope = body.scope === ROOT_SCOPE ? ROOT_SCOPE : project;
  const roleIds = body.roleIds?.length
    ? body.roleIds
    : [ROLE_READER, ROLE_FOUNDRY_USER];

  for (const roleId of roleIds) {
    if (!roleById(roleId)) {
      return NextResponse.json({ error: "Unknown role." }, { status: 400 });
    }
  }

  const actorId = (await currentSession())?.principal.id ?? "system";
  const accessCode = generateAccessCode();
  const salt = newSalt();
  const now = nowIso();

  const result = await mutateDirectory((directory) => {
    if (
      directory.principals.some(
        (item) => item.email.toLowerCase() === email && !item.disabledAt
      )
    ) {
      return null;
    }
    const principal: Principal = {
      id: `usr_${randomUUID().slice(0, 8)}`,
      kind: "user",
      name,
      email,
      initials: initialsFor(name),
      createdAt: now,
    };
    directory.principals.push(principal);

    const credential: Credential = {
      id: `cred_${randomUUID().slice(0, 8)}`,
      principalId: principal.id,
      kind: "access_code",
      lookup: normalizeCode(accessCode).slice(0, 4),
      salt,
      hash: hashSecret(normalizeCode(accessCode), salt),
      createdAt: now,
    };
    directory.credentials.push(credential);

    const assignments: Assignment[] = roleIds.map((roleId) => ({
      id: `asg_${randomUUID().slice(0, 8)}`,
      principalId: principal.id,
      roleId,
      scope,
      createdAt: now,
      createdBy: actorId,
    }));
    directory.assignments.push(...assignments);

    return { principal, assignments };
  });

  if (!result) {
    return NextResponse.json(
      { error: "A person with that email already exists." },
      { status: 409 }
    );
  }

  void appendAudit({
    actorId,
    action: "principal.create",
    target: result.principal.id,
    scope,
    outcome: "allowed",
    detail: result.principal.email,
  });

  return NextResponse.json(
    {
      principal: {
        id: result.principal.id,
        name: result.principal.name,
        email: result.principal.email,
        initials: result.principal.initials,
      },
      assignments: result.assignments.map((assignment) => ({
        roleId: assignment.roleId,
        roleName: roleById(assignment.roleId)?.name ?? "Unknown",
        scope: assignment.scope,
      })),
      accessCode,
    },
    { status: 201 }
  );
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    disabled?: boolean;
  };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const actorId = (await currentSession())?.principal.id ?? "system";

  const result = await mutateDirectory((directory) => {
    const principal = directory.principals.find((item) => item.id === body.id);
    if (!principal) return { ok: false as const, reason: "missing" };
    if (body.disabled && principal.id === actorId) {
      return { ok: false as const, reason: "self" };
    }
    if (body.disabled) {
      const probe = {
        ...directory,
        principals: directory.principals.map((item) =>
          item.id === principal.id ? { ...item, disabledAt: nowIso() } : item
        ),
      };
      if (accessControllerCount(probe) === 0) {
        return { ok: false as const, reason: "last_owner" };
      }
      principal.disabledAt = nowIso();
      revokeSessionsFor(directory, principal.id);
    }
    if (body.name?.trim()) principal.name = body.name.trim();
    return { ok: true as const };
  });

  if (!result.ok) {
    const message =
      result.reason === "missing"
        ? "Person not found."
        : result.reason === "self"
          ? "You cannot disable your own account."
          : "This install must keep at least one person who can change access.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  void appendAudit({
    actorId,
    action: "principal.update",
    target: body.id,
    outcome: "allowed",
  });

  return NextResponse.json({ ok: true });
}
