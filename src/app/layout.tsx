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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('openfoundry:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}",
          }}
        />
        <AppShell settings={settings} systemHost={hostName()}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
