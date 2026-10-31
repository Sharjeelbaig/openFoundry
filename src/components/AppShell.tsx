"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Header from "./Header";
import SetupWizard from "./SetupWizard";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import { ToastProvider } from "./Toast";
import { DownloadProvider } from "./Downloads";
import type { LocalSettings } from "@/lib/types";

export default function AppShell({
  children,
  settings,
  systemHost,
  theme,
}: {
  children: React.ReactNode;
  settings: LocalSettings;
  systemHost: string;
  theme: "dark" | "light";
}) {
  const pathname = usePathname();
  const showFooter = pathname === "/" || pathname.startsWith("/discover");
  const noScroll =
    /^\/build\/agents\/[^/]+\/build/.test(pathname) ||
    pathname.startsWith("/playground");
  const surface =
    pathname.startsWith("/build") ||
    pathname.startsWith("/operate") ||
    pathname.startsWith("/manage") ||
    pathname.startsWith("/playground");

  if (!settings.onboarded || pathname === "/setup") {
    return (
      <ToastProvider>
        <DownloadProvider>
          <SetupWizard initial={settings} systemHost={systemHost} />
        </DownloadProvider>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <DownloadProvider>
        <div className="app-shell">
          <Header
            projectName={settings.projectName}
            userName={settings.userName}
            userInitials={settings.userInitials}
            initialTheme={theme}
          />
          <div className="app-body">
            <Sidebar />
            <main
              className={`app-main${noScroll ? " no-scroll" : ""}${
                surface ? " surface" : ""
              }`}
            >
              {children}
            </main>
          </div>
          {showFooter && (
            <footer className="app-footer">
              <nav aria-label="Legal">
                <Link href="/terms">Terms</Link>
                <Link href="/privacy">Privacy</Link>
              </nav>
            </footer>
          )}
        </div>
        <CommandPalette />
      </DownloadProvider>
    </ToastProvider>
  );
}
