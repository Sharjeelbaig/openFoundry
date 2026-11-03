import { NextResponse, type NextRequest } from "next/server";
import { appendAudit } from "@/lib/directory/audit";
import { hasOwner } from "@/lib/directory/bootstrap";
import { can } from "@/lib/directory/can";
import { resolveApiRoute } from "@/lib/directory/routes";
import { scopeForAction } from "@/lib/directory/scope";
import { findSession, SESSION_COOKIE } from "@/lib/directory/sessions";
import { getDirectory } from "@/lib/directory/store";

export const config = {
  // Everything except the framework's assets and files with an extension.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { message, type: "authorization_error", code } },
    { status, headers: { "cache-control": "no-store" } }
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const directory = await getDirectory();
  const claimed = hasOwner(directory);
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = findSession(directory, sessionId);

  if (pathname.startsWith("/api")) {
    const route = resolveApiRoute(request.method, pathname);
    if (route.visibility === "public") return NextResponse.next();
    if (route.visibility === "unmapped") {
      void appendAudit({
        actorId: session?.principalId ?? null,
        action: "route.unmapped",
        target: `${request.method} ${pathname}`,
        outcome: "denied",
      });
      return jsonError(403, "unmapped_route", "This endpoint is not mapped to an action.");
    }
    if (!session) {
      return jsonError(401, "no_session", "Sign in to use this endpoint.");
    }
    const scope = await scopeForAction(route.action);
    const decision = can(directory, session.principalId, route.action, scope);
    if (!decision.allowed) {
      void appendAudit({
        actorId: session.principalId,
        action: "auth.denied",
        target: `${request.method} ${pathname}`,
        scope,
        outcome: "denied",
        detail: `${route.action}: ${decision.reason}`,
      });
      return jsonError(
        403,
        "insufficient_permissions",
        `This action needs the ${route.action} permission.`
      );
    }
    return NextResponse.next();
  }

  // Pages.
  if (!claimed) {
    if (pathname === "/setup") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/signin") {
    if (!session) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
