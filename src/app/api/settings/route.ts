import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/store";
import { invalidateModelCache } from "@/lib/providers";
import { LocalSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_NAME = /^[a-z0-9][a-z0-9-]{1,62}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

function validUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET() {
  return NextResponse.json({ settings: await getSettings() });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<LocalSettings> & {
    action?: "rotate-api-key";
  };
  const current = await getSettings();

  if (body.action === "rotate-api-key") {
    const settings = { ...current, apiKey: `fl-${randomUUID().replace(/-/g, "")}` };
    await saveSettings(settings);
    return NextResponse.json({ settings });
  }

  const next: LocalSettings = { ...current };

  if (body.projectName !== undefined) {
    const projectName = body.projectName.trim().toLowerCase();
    if (!PROJECT_NAME.test(projectName))
      return NextResponse.json(
        {
          error:
            "Project name must be 2–63 characters: lowercase letters, numbers and hyphens, starting with a letter or number.",
        },
        { status: 400 }
      );
    next.projectName = projectName;
  }
  if (body.userName !== undefined) {
    const userName = body.userName.trim();
    if (!userName)
      return NextResponse.json({ error: "Your name cannot be empty." }, { status: 400 });
    next.userName = userName;
  }
  if (body.userEmail !== undefined) {
    const userEmail = body.userEmail.trim();
    if (!EMAIL.test(userEmail))
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    next.userEmail = userEmail;
  }
  if (body.userInitials !== undefined) {
    const initials = body.userInitials.trim().slice(0, 3).toUpperCase();
    if (!initials)
      return NextResponse.json({ error: "Initials cannot be empty." }, { status: 400 });
    next.userInitials = initials;
  }
  if (body.resourceGroup !== undefined) {
    const group = body.resourceGroup.trim().toLowerCase();
    if (!PROJECT_NAME.test(group))
      return NextResponse.json(
        { error: "Resource group must use lowercase letters, numbers and hyphens." },
        { status: 400 }
      );
    next.resourceGroup = group;
  }
  if (body.resourceName !== undefined) {
    const resourceName = body.resourceName.trim();
    if (resourceName.length < 2 || resourceName.length > 64)
      return NextResponse.json(
        { error: "Resource name must be 2–64 characters." },
        { status: 400 }
      );
    next.resourceName = resourceName;
  }
  if (body.location !== undefined) next.location = body.location.trim() || "On device";
  if (body.region !== undefined) next.region = body.region.trim() || "On device";
  if (body.subscriptionName !== undefined)
    next.subscriptionName = body.subscriptionName.trim() || "Local subscription";
  if (body.foundryUrl !== undefined) {
    const value = body.foundryUrl.trim().replace(/\/+$/, "");
    if (!validUrl(value))
      return NextResponse.json({ error: "Foundry Local URL is not valid." }, { status: 400 });
    next.foundryUrl = value;
  }
  if (body.ollamaUrl !== undefined) {
    const value = body.ollamaUrl.trim().replace(/\/+$/, "");
    if (!validUrl(value))
      return NextResponse.json({ error: "Ollama URL is not valid." }, { status: 400 });
    next.ollamaUrl = value;
  }
  if (body.lmStudioUrl !== undefined) {
    const value = body.lmStudioUrl.trim().replace(/\/+$/, "");
    if (!validUrl(value))
      return NextResponse.json({ error: "LM Studio URL is not valid." }, { status: 400 });
    next.lmStudioUrl = value;
  }
  if (body.llamaCppUrl !== undefined) {
    const value = body.llamaCppUrl.trim().replace(/\/+$/, "");
    if (!validUrl(value))
      return NextResponse.json({ error: "llama.cpp URL is not valid." }, { status: 400 });
    next.llamaCppUrl = value;
  }
  if (body.huggingFacePath !== undefined) {
    next.huggingFacePath = body.huggingFacePath.trim();
  }
  if (body.onboarded !== undefined) next.onboarded = Boolean(body.onboarded);
  if (body.termsAccepted !== undefined)
    next.termsAccepted = Boolean(body.termsAccepted);
  if (body.defaultProviderId !== undefined)
    next.defaultProviderId = body.defaultProviderId;
  if (body.defaultModel !== undefined) next.defaultModel = body.defaultModel;
  if (body.initialized !== undefined) next.initialized = Boolean(body.initialized);

  const ownerIndex = next.users.findIndex((user) => user.role === "Owner");
  if (ownerIndex >= 0) {
    next.users = next.users.map((user, index) =>
      index === ownerIndex
        ? { ...user, name: next.userName, email: next.userEmail }
        : user
    );
  }

  await saveSettings(next);
  invalidateModelCache();
  return NextResponse.json({ settings: next });
}
