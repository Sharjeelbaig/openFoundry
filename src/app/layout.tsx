import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { OriginProvider } from "@/components/Origin";
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
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body>
        <OriginProvider value={origin}>
          <AppShell settings={settings} systemHost={hostName()} theme={theme}>
            {children}
          </AppShell>
        </OriginProvider>
      </body>
    </html>
  );
}
