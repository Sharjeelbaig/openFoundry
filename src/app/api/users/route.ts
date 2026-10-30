import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSettings, nowIso, saveSettings } from "@/lib/store";
import { ProjectRole, ProjectUser } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: ProjectRole[] = ["Owner", "Contributor", "Reader"];
const EMAIL = /^[^\s@]+@[^\s@]+$/;

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ users: settings.users });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<ProjectUser>;
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = (body.role || "Reader") as ProjectRole;
  if (!name || !email)
    return NextResponse.json(
      { error: "name and email are required" },
      { status: 400 }
    );
  if (!EMAIL.test(email))
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!ROLES.includes(role))
    return NextResponse.json({ error: "Unknown role." }, { status: 400 });

  const settings = await getSettings();
  if (settings.users.some((user) => user.email.toLowerCase() === email))
    return NextResponse.json(
      { error: "A user with that email already exists." },
      { status: 409 }
    );

  const user: ProjectUser = {
    id: `user_${randomUUID().slice(0, 8)}`,
    name,
    email,
    role,
    accessType: "Direct access",
    addedAt: nowIso(),
  };
  const next = { ...settings, users: [...settings.users, user] };
  await saveSettings(next);
  return NextResponse.json({ user, users: next.users }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<ProjectUser> & {
    id?: string;
  };
  if (!body.id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  const settings = await getSettings();
  const target = settings.users.find((user) => user.id === body.id);
  if (!target)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const role = body.role ?? target.role;
  if (!ROLES.includes(role))
    return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  if (
    target.role === "Owner" &&
    role !== "Owner" &&
    settings.users.filter((user) => user.role === "Owner").length === 1
  )
    return NextResponse.json(
      { error: "The project must keep at least one Owner." },
      { status: 400 }
    );

  const nextUsers = settings.users.map((user) =>
    user.id === body.id
      ? {
          ...user,
          name: body.name?.trim() || user.name,
          email: body.email?.trim().toLowerCase() || user.email,
          role,
        }
      : user
  );
  await saveSettings({ ...settings, users: nextUsers });
  return NextResponse.json({
    user: nextUsers.find((user) => user.id === body.id),
    users: nextUsers,
  });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  const settings = await getSettings();
  const target = settings.users.find((user) => user.id === id);
  if (!target)
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (
    target.role === "Owner" &&
    settings.users.filter((user) => user.role === "Owner").length === 1
  )
    return NextResponse.json(
      { error: "You cannot remove the only Owner of the project." },
      { status: 400 }
    );
  await saveSettings({
    ...settings,
    users: settings.users.filter((user) => user.id !== id),
  });
  return NextResponse.json({ ok: true });
}
