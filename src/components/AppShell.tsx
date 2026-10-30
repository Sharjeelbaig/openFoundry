import { Link, useLocation } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import type { Settings } from "../lib/types";

export default function AppShell({
  settings,
  children,
}: {
  settings: Settings;
  children: React.ReactNode;
}) {
  const pathname = useLocation().pathname;
  const showFooter =
    pathname === "/" || pathname.startsWith("/discover") || pathname === "/docs";
  const noScroll =
    /^\/build\/agents\/[^/]+$/.test(pathname) || pathname.startsWith("/playground");
  const surface =
    pathname.startsWith("/build") ||
    pathname.startsWith("/operate") ||
    pathname.startsWith("/manage") ||
    pathname.startsWith("/playground");

  return (
    <div className="app-shell">
      <Header settings={settings} />
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
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
        </footer>
      )}
    </div>
  );
}
