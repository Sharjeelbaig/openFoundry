// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import AppShell from "@/components/AppShell";
import AppContextMenu from "@/components/AppContextMenu";
import { OriginProvider } from "@/components/Origin";
import { projectScope, summaryFor } from "@/lib/directory/can";
import { hasOwner } from "@/lib/directory/bootstrap";
import { currentSession } from "@/lib/directory/server";
import { getDirectory } from "@/lib/directory/store";
import { getSettings, hostName } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "openFoundry",
  description:
    "An independent local AI workbench for models, agents and knowledge.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSettings();
  // The theme lives in a cookie so the server can render the right palette on
  // the first paint. Reading it here also keeps hydration from resetting the
  // attribute back to the default.
  const theme =
    (await cookies()).get("openfoundry:theme")?.value === "light"
      ? "light"
      : "dark";
  // Resolve the origin from the request itself so server-rendered endpoint
  // samples match the address the browser actually loaded.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") || "http";
  const origin = `${proto}://${host}`;
  const session = await currentSession();
  const directory = session?.directory ?? (await getDirectory());
  const summary = session
    ? summaryFor(session.directory, session.principal.id, projectScope(settings.projectId))
    : null;
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body>
        <OriginProvider value={origin}>
          <AppShell
            settings={settings}
            systemHost={hostName()}
            theme={theme}
            needsClaim={!hasOwner(directory)}
            user={
              session
                ? {
                    name: session.principal.name,
                    initials: session.principal.initials,
                    email: session.principal.email,
                    roleName: summary?.roleName ?? "No role",
                    access: summary?.access ?? "No access",
                  }
                : null
            }
          >
            {children}
          </AppShell>
        </OriginProvider>
        <AppContextMenu />
      </body>
    </html>
  );
}
