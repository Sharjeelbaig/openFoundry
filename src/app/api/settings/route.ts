import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/store";
import { currentSession } from "@/lib/directory/server";
import { getDirectory, mutateDirectory } from "@/lib/directory/store";
import { may } from "@/lib/directory/redact";
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
  const settings = await getSettings();
  // A Reader can see the project; it must not hand them the key that unlocks
  // the API surface their role excludes.
  return NextResponse.json({
    settings: (await may("settings.write"))
      ? settings
      : { ...settings, apiKey: "" },
  });
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

  // The signed-in person is a directory principal. Validate the profile
  // fields before saving, so settings and the directory cannot disagree.
  const session = await currentSession();
  const profileEmail = next.userEmail.trim().toLowerCase();
  if (session && (body.userName !== undefined || body.userEmail !== undefined)) {
    if (!EMAIL.test(profileEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const directory = await getDirectory();
    const clash = directory.principals.some(
      (principal) =>
        principal.id !== session.principal.id &&
        principal.email.toLowerCase() === profileEmail &&
        !principal.disabledAt
    );
    if (clash) {
      return NextResponse.json(
        { error: "Another person in this install already uses that email." },
        { status: 409 }
      );
    }
  }

  await saveSettings(next);
  invalidateModelCache();

  if (session && (body.userName !== undefined || body.userEmail !== undefined)) {
    await mutateDirectory((directory) => {
      const principal = directory.principals.find(
        (item) => item.id === session.principal.id
      );
      if (!principal) return;
      principal.name = next.userName.trim() || principal.name;
      principal.email = profileEmail;
      principal.initials = next.userInitials || principal.initials;
    });
  }

  return NextResponse.json({ settings: next });
}
