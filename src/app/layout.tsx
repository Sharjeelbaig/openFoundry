import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import AppShell from "@/components/AppShell";
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
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body>
        <AppShell settings={settings} systemHost={hostName()} theme={theme}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
