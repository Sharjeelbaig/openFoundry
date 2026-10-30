import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft20Regular,
  Delete20Regular,
  Play20Regular,
  Save20Regular,
} from "@fluentui/react-icons";
import { ModelLogo } from "../components/Logos";
import { Spinner } from "../components/ui";
import { useApp } from "../lib/app-context";
import { deleteAgent, saveAgent } from "../lib/api";
import { formatDate } from "../lib/format";
import { useProviders } from "../lib/useProviders";
import type { Agent } from "../lib/types";

export default function AgentDetail() {
  const { id } = useParams();
  const { data, refresh, updateSettings } = useApp();
  const { providers } = useProviders(data.settings);
  const navigate = useNavigate();
  const agent = data.agents.find((entry) => entry.id === id);
  const [draft, setDraft] = useState<Agent | null>(agent || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (agent) setDraft(agent);
  }, [agent]);

  const models = useMemo(
    () => providers.flatMap((provider) => provider.models),
    [providers]
  );

  if (!agent || !draft) {
    return (
      <div className="page">
        <div className="banner error">Agent not found.</div>
        <Link to="/build/agents" className="btn btn-secondary mt-16">
          Back to agents
        </Link>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const model = models.find(
        (entry) => entry.providerId === draft.providerId && entry.id === draft.model
      );
      const saved = await saveAgent({
        ...draft,
        providerLabel: model?.providerLabel || draft.providerLabel,
      });
      updateSettings({
        ...data,
        agents: data.agents.map((entry) => (entry.id === saved.id ? saved : entry)),
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await deleteAgent(draft.id);
    await refresh();
    navigate("/build/agents");
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div className="row" style={{ gap: 10 }}>
          <button className="icon-button" onClick={() => navigate("/build/agents")} aria-label="Back">
            <ArrowLeft20Regular />
          </button>
          <div>
            <h1 className="page-title">{draft.name}</h1>
            <p className="page-subtitle">
              Local agent · updated {formatDate(draft.updatedAt)}
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={remove}>
            <Delete20Regular /> Delete
          </button>
          <button className="btn btn-secondary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <Save20Regular />} Save
          </button>
          <Link
            to={`/playground?provider=${encodeURIComponent(draft.providerId)}&model=${encodeURIComponent(draft.model)}`}
            className="btn btn-primary"
          >
            <Play20Regular /> Test in playground
          </Link>
        </div>
      </div>

      <div className="builder-body" style={{ paddingTop: 20 }}>
        <div className="builder-config">
          <section className="config-section">
            <div className="config-head">Model</div>
            <div className="config-body">
              <select
                className="select"
                value={`${draft.providerId}|${draft.model}`}
                onChange={(event) => {
                  const [providerId, ...rest] = event.target.value.split("|");
                  const modelId = rest.join("|");
                  const model = models.find(
                    (entry) => entry.providerId === providerId && entry.id === modelId
                  );
                  if (model)
                    setDraft({
                      ...draft,
                      providerId,
                      model: model.id,
                      providerLabel: model.providerLabel,
                    });
                }}
              >
                {models.map((model) => (
                  <option key={`${model.providerId}/${model.id}`} value={`${model.providerId}|${model.id}`}>
                    {model.name} · {model.providerLabel}
                  </option>
                ))}
              </select>
              <div className="row mt-8" style={{ gap: 8 }}>
                <ModelLogo publisher={draft.providerLabel} name={draft.model} size={22} />
                <span className="muted text-12">{draft.model}</span>
              </div>
            </div>
          </section>
          <section className="config-section">
            <div className="config-head">Instructions</div>
            <div className="config-body">
              <textarea
                className="textarea"
                style={{ minHeight: 260 }}
                value={draft.instructions}
                onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
              />
              <p className="field-hint">
                {draft.instructions.length} characters · sent as the system message on
                every request.
              </p>
            </div>
          </section>
        </div>
        <div className="builder-chat">
          <div className="chat-head">
            <span className="chat-head-meta">
              <strong>Agent preview</strong>
            </span>
          </div>
          <div className="chat-body">
            <div className="chat-empty">
              <ModelLogo publisher={draft.providerLabel} name={draft.name} size={42} />
              <h2>{draft.name}</h2>
              <p>Open the playground to test this agent&apos;s model.</p>
              <Link
                to={`/playground?provider=${encodeURIComponent(draft.providerId)}&model=${encodeURIComponent(draft.model)}`}
                className="btn btn-primary mt-8"
              >
                <Play20Regular /> Test model
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
