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
  user,
  needsClaim,
}: {
  children: React.ReactNode;
  settings: LocalSettings;
  systemHost: string;
  theme: "dark" | "light";
  needsClaim: boolean;
  user: {
    name: string;
    initials: string;
    email: string;
    roleName: string;
    access: string;
  } | null;
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

  if (pathname === "/signin") {
    return <>{children}</>;
  }

  if (!settings.onboarded || pathname === "/setup") {
    return (
      <ToastProvider>
        <DownloadProvider>
          <SetupWizard
            initial={settings}
            systemHost={systemHost}
            needsClaim={needsClaim}
          />
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
            userName={user?.name ?? settings.userName}
            userInitials={user?.initials ?? settings.userInitials}
            userEmail={user?.email}
            roleName={user?.roleName}
            access={user?.access}
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
