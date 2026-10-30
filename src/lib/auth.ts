import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "./store";
import { Agent, Deployment } from "./types";

export function requestKey(req: NextRequest): string {
  const header = req.headers.get("api-key");
  if (header) return header.trim();
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function isProjectKey(req: NextRequest): Promise<boolean> {
  const key = requestKey(req);
  if (!key) return false;
  const settings = await getSettings();
  return key === settings.apiKey;
}

export async function isDeploymentKey(
  req: NextRequest,
  deployment?: Deployment
): Promise<boolean> {
  const key = requestKey(req);
  if (!key) return false;
  const settings = await getSettings();
  if (key === settings.apiKey) return true;
  return Boolean(deployment && key === deployment.apiKey);
}

export async function isAgentKey(
  req: NextRequest,
  agent?: Agent
): Promise<boolean> {
  const key = requestKey(req);
  if (!key) return false;
  const settings = await getSettings();
  if (key === settings.apiKey) return true;
  return Boolean(agent && key === agent.apiKey);
}

export function unauthorized(message = "A valid project api-key is required.") {
  return NextResponse.json(
    { error: { message, type: "authentication_error", code: "invalid_api_key" } },
    { status: 401 }
  );
}
