import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/directory/audit";
import { ACCESS_CODE_LENGTH, normalizeCode, verifySecret } from "@/lib/directory/codes";
import { rateLimit } from "@/lib/directory/rate-limit";
import { requestAddress, sessionCookie } from "@/lib/directory/server";
import { issueSession } from "@/lib/directory/sessions";
import { mutateDirectory } from "@/lib/directory/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalid() {
  return NextResponse.json(
    {
      error: {
        message: "That access code is not valid.",
        type: "authentication_error",
        code: "invalid_code",
      },
    },
    { status: 401, headers: { "cache-control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = normalizeCode(body.code ?? "");
  const address = requestAddress(req);

  const limit = rateLimit(`sign-in:${address}`, 10, 60_000);
  if (!limit.ok) {
    void appendAudit({
      actorId: null,
      action: "auth.sign_in",
      target: address,
      outcome: "denied",
      detail: "rate limited",
    });
    return NextResponse.json(
      {
        error: {
          message: "Too many attempts. Wait a minute and try again.",
          type: "authentication_error",
          code: "rate_limited",
        },
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  if (code.length !== ACCESS_CODE_LENGTH) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return invalid();
  }

  const lookup = code.slice(0, 4);
  let sessionId = "";
  const result = await mutateDirectory((directory) => {
    const credential = directory.credentials.find(
      (item) =>
        item.kind === "access_code" &&
        item.lookup === lookup &&
        !item.revokedAt &&
        verifySecret(code, item.salt, item.hash)
    );
    if (!credential) return { ok: false as const, reason: "no_match" };
    if (credential.expiresAt && Date.parse(credential.expiresAt) <= Date.now()) {
      return { ok: false as const, reason: "expired" };
    }
    const principal = directory.principals.find(
      (item) => item.id === credential.principalId
    );
    if (!principal || principal.disabledAt) {
      return { ok: false as const, reason: "no_principal" };
    }
    credential.lastUsedAt = new Date().toISOString();
    const issued = issueSession(directory, principal.id, {
      userAgent: req.headers.get("user-agent") ?? "",
      address,
    });
    sessionId = issued.id;
    return { ok: true as const, principal };
  });

  if (!result.ok) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    void appendAudit({
      actorId: null,
      action: "auth.sign_in",
      target: address,
      outcome: "failed",
      detail: result.reason,
    });
    return invalid();
  }

  void appendAudit({
    actorId: result.principal.id,
    action: "auth.sign_in",
    target: result.principal.email,
    outcome: "allowed",
  });

  const response = NextResponse.json({
    ok: true,
    principal: {
      id: result.principal.id,
      name: result.principal.name,
      email: result.principal.email,
      initials: result.principal.initials,
    },
  });
  response.cookies.set(sessionCookie(req, sessionId));
  return response;
}
