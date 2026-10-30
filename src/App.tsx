import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import SetupWizard from "./components/SetupWizard";
import { AppContext } from "./lib/app-context";
import { loadApp, saveSettings } from "./lib/api";
import type { AppData, Settings } from "./lib/types";
import { EmptyState, Spinner } from "./components/ui";
import Home from "./pages/Home";
import Models from "./pages/Models";
import Playground from "./pages/Playground";
import Agents from "./pages/Agents";
import AgentDetail from "./pages/AgentDetail";
import Services from "./pages/Services";
import Knowledge from "./pages/Knowledge";
import Evaluations from "./pages/Evaluations";
import Operate from "./pages/Operate";
import Manage from "./pages/Manage";
import DataPage from "./pages/DataPage";
import Docs from "./pages/Docs";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import DiscoverOverview from "./pages/DiscoverOverview";
import ModulePage from "./pages/ModulePage";

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await loadApp();
      setData(next);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="boot-screen">
        <Spinner />
        <span>Starting openFoundry…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="boot-screen">
        <strong>openFoundry could not start.</strong>
        <span>{error || "App data is unavailable."}</span>
        <button className="btn btn-secondary" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }

  const completeSetup = async (settings: Settings) => {
    const saved = await saveSettings(settings);
    setData((current) => (current ? { ...current, settings: saved } : current));
  };

  if (!data.settings.onboarded) {
    return <SetupWizard initial={data.settings} onComplete={completeSetup} />;
  }

  return (
    <AppContext.Provider
      value={{
        data,
        refresh,
        updateSettings: (next: AppData) => setData(next),
      }}
    >
      <AppShell settings={data.settings}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/discover" element={<Navigate to="/discover/overview" replace />} />
          <Route path="/discover/overview" element={<DiscoverOverview />} />
          <Route path="/discover/models" element={<Models />} />
          <Route path="/discover/agents" element={<Agents />} />
          <Route path="/discover/tools" element={<ModulePage title="Tools" kind="tools" />} />
          <Route path="/discover/knowledge" element={<Knowledge />} />
          <Route path="/discover/services" element={<Services />} />
          <Route
            path="/discover/solutiontemplates"
            element={<ModulePage title="Solution templates" kind="templates" />}
          />
          <Route path="/build" element={<Navigate to="/build/agents" replace />} />
          <Route path="/build/agents" element={<Agents />} />
          <Route path="/build/agents/:id" element={<AgentDetail />} />
          <Route
            path="/build/models"
            element={<Navigate to="/build/models/deployments" replace />}
          />
          <Route path="/build/models/deployments" element={<Models />} />
          <Route path="/build/services" element={<Services />} />
          <Route path="/build/tools" element={<ModulePage title="Tools" kind="tools" />} />
          <Route path="/build/knowledge" element={<Navigate to="/build/knowledge/search" replace />} />
          <Route path="/build/knowledge/search" element={<Knowledge />} />
          <Route path="/build/memory" element={<ModulePage title="Memory" kind="memory" />} />
          <Route
            path="/build/guardrails"
            element={<ModulePage title="Guardrails" kind="guardrails" />}
          />
          <Route path="/build/data" element={<DataPage />} />
          <Route path="/build/evaluations" element={<Evaluations />} />
          <Route path="/build/fine-tune" element={<ModulePage title="Fine-tune" kind="fine-tune" />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/operate" element={<Operate />} />
          <Route path="/operate/assets" element={<ModulePage title="Assets" kind="assets" />} />
          <Route
            path="/operate/compliance"
            element={<ModulePage title="Compliance" kind="compliance" />}
          />
          <Route path="/manage" element={<Manage />} />
          <Route path="/manage/quota" element={<Manage section="quota" />} />
          <Route path="/manage/gateway" element={<Manage section="gateway" />} />
          <Route path="/manage/resources" element={<Manage section="resources" />} />
          <Route path="/manage/project" element={<Navigate to="/manage" replace />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route
            path="*"
            element={
              <div className="page">
                <EmptyState title="Page not found" description="This route does not exist." />
              </div>
            }
          />
        </Routes>
      </AppShell>
    </AppContext.Provider>
  );
}

