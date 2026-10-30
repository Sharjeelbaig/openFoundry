import { useEffect, useState } from "react";
import { Folder20Regular, Info20Regular } from "@fluentui/react-icons";
import { CopyButton } from "../components/ui";
import { useApp } from "../lib/app-context";
import { dataDirectory } from "../lib/api";
import { openFolder } from "../lib/open";

export default function DataPage() {
  const { data } = useApp();
  const [path, setPath] = useState("");
  useEffect(() => {
    void dataDirectory().then(setPath);
  }, []);

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Data</h1>
          <p className="page-subtitle">Everything openFoundry stores on this computer.</p>
        </div>
      </div>

      <div className="operate-card mt-16">
        <div className="row between">
          <div>
            <div className="field-label">Workspace data directory</div>
            <div className="model-id-box mono mt-8" style={{ maxWidth: 720 }}>{path || "Loading…"}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <CopyButton value={path} label="Copy data path" />
            <button className="btn btn-secondary" onClick={() => void openFolder(path)} disabled={!path}>
              <Folder20Regular /> Open folder
            </button>
          </div>
        </div>
      </div>

      <div className="metric-grid mt-16">
        <div className="operate-card">
          <span className="metric-label">Agents</span>
          <span className="metric-value">{data.agents.length}</span>
          <span className="metric-note">Prompt agent records</span>
        </div>
        <div className="operate-card">
          <span className="metric-label">Providers</span>
          <span className="metric-value">{data.settings.providers.length}</span>
          <span className="metric-note">Configured endpoints</span>
        </div>
        <div className="operate-card">
          <span className="metric-label">API key</span>
          <span className="metric-value" style={{ fontSize: 16 }}>Local</span>
          <span className="metric-note">Generated on this computer</span>
        </div>
        <div className="operate-card">
          <span className="metric-label">Telemetry</span>
          <span className="metric-value" style={{ fontSize: 18 }}>Off</span>
          <span className="metric-note">No analytics or remote logging</span>
        </div>
      </div>

      <div className="table-card mt-16">
        <table className="data-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Contents</th>
              <th style={{ width: 120 }}>Records</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono text-12">openfoundry.json</td>
              <td>Workspace profile, providers and agents</td>
              <td>1</td>
            </tr>
            <tr>
              <td className="mono text-12">models/</td>
              <td>Reserved for downloaded model metadata</td>
              <td>0</td>
            </tr>
            <tr>
              <td className="mono text-12">knowledge/</td>
              <td>Reserved for documents and indexes</td>
              <td>0</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="banner mt-16">
        <Info20Regular />
        <span>
          Model weights remain in the provider&apos;s own cache. openFoundry only stores
          workspace metadata.
        </span>
      </div>
    </div>
  );
}
