import { NextRequest } from "next/server";
import { exchangeOAuthCode, takeOAuthPending } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(options: {
  title: string;
  message: string;
  ok: boolean;
  payload: Record<string, unknown>;
  origin: string;
}): Response {
  const payload = JSON.stringify(options.payload).replace(/</g, "\\u003c");
  const message = escapeHtml(options.message);
  return new Response(
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111; color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(520px, calc(100vw - 48px)); border: 1px solid #333; border-radius: 14px; padding: 28px; background: #1b1b1b; }
    h1 { font-size: 20px; margin: 0 0 10px; }
    p { color: #c9c9c9; line-height: 1.5; }
    a { color: #c9aaf9; }
    .mark { display: inline-flex; width: 34px; height: 34px; border-radius: 9px; background: #2a203b; color: #c9aaf9; align-items: center; justify-content: center; font-weight: 700; margin-bottom: 14px; }
  </style>
</head>
<body>
  <main>
    <div class="mark">oF</div>
    <h1>${escapeHtml(options.title)}</h1>
    <p>${message}</p>
    <p><a href="/discover/tools">Return to openFoundry</a></p>
  </main>
  <script>
    (() => {
      const payload = ${payload};
      const origin = ${JSON.stringify(options.origin)};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, origin);
          setTimeout(() => window.close(), 700);
        }
      } catch (error) {
        // The link above is the fallback when the opener is gone.
      }
    })();
  </script>
</body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const error = params.get("error");
  const description = params.get("error_description");
  const state = params.get("state");
  const code = params.get("code");
  const origin = req.nextUrl.origin;

  if (error) {
    return page({
      title: "OAuth connection failed",
      message: description || error,
      ok: false,
      payload: { type: "openfoundry-oauth", ok: false, error: description || error },
      origin,
    });
  }
  if (!state || !code) {
    return page({
      title: "OAuth callback is incomplete",
      message: "The provider did not return a state or authorization code.",
      ok: false,
      payload: {
        type: "openfoundry-oauth",
        ok: false,
        error: "Missing state or code.",
      },
      origin,
    });
  }

  const pending = await takeOAuthPending(state);
  if (!pending) {
    return page({
      title: "OAuth state expired",
      message:
        "This login attempt expired or was already used. Start the OAuth connection again from the tool setup.",
      ok: false,
      payload: {
        type: "openfoundry-oauth",
        ok: false,
        error: "OAuth state expired or was already used.",
      },
      origin,
    });
  }

  try {
    await exchangeOAuthCode(pending, code);
    return page({
      title: "Connected",
      message: `${pending.toolName} is connected. You can close this window and return to openFoundry.`,
      ok: true,
      payload: {
        type: "openfoundry-oauth",
        ok: true,
        toolId: pending.toolId,
        authMethodId: pending.authMethodId,
      },
      origin: new URL(pending.redirectUri).origin,
    });
  } catch (err) {
    return page({
      title: "Token exchange failed",
      message:
        err instanceof Error
          ? err.message
          : "The provider did not return an access token.",
      ok: false,
      payload: {
        type: "openfoundry-oauth",
        ok: false,
        toolId: pending.toolId,
        authMethodId: pending.authMethodId,
        error:
          err instanceof Error
            ? err.message
            : "The provider did not return an access token.",
      },
      origin: new URL(pending.redirectUri).origin,
    });
  }
}
