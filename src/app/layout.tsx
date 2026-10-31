import type { Metadata } from "next";
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
  return (
    <html lang="en" data-theme="Dark">
      <body>
        <AppShell settings={settings} systemHost={hostName()}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
