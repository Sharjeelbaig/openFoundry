import { NextRequest, NextResponse } from "next/server";
import { getLocalSkills, newId, nowIso, saveLocalSkills } from "@/lib/store";
import { LocalSkill } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ skills: await getLocalSkills() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    instructions?: string;
    source?: LocalSkill["source"];
  };
  const name = body.name?.trim();
  const instructions = body.instructions?.trim();
  if (!name)
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!instructions)
    return NextResponse.json(
      { error: "instructions are required" },
      { status: 400 }
    );
  const skills = await getLocalSkills();
  if (skills.some((skill) => skill.name.toLowerCase() === name.toLowerCase()))
    return NextResponse.json(
      { error: `A skill named "${name}" already exists.` },
      { status: 409 }
    );
  const skill: LocalSkill = {
    id: newId("lskill"),
    name,
    description: body.description?.trim() || "",
    instructions,
    source: body.source === "uploaded" ? "uploaded" : "created",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  skills.unshift(skill);
  await saveLocalSkills(skills);
  return NextResponse.json({ skill }, { status: 201 });
}
