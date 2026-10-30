import { Link } from "react-router-dom";
import { Info20Regular, Wrench20Regular } from "@fluentui/react-icons";
import { EmptyState } from "../components/ui";
import { useApp } from "../lib/app-context";

const COPY: Record<string, { title: string; description: string; note: string }> = {
  tools: {
    title: "Tools",
    description: "No tools are enabled in this build.",
    note: "Tools such as web search and local retrieval will be added after the agent runtime and knowledge index are complete.",
  },
  memory: {
    title: "Memory",
    description: "No agent memory yet.",
    note: "Memory is managed per agent. Create an agent first, then conversation memory will appear here.",
  },
  guardrails: {
    title: "Guardrails",
    description: "No agent guardrails configured.",
    note: "Guardrail policies will be attached to prompt agents in the next milestone.",
  },
  assets: {
    title: "Assets",
    description: "No assets registered.",
    note: "Agents and provider models will appear here as workspace assets.",
  },
  compliance: {
    title: "Compliance",
    description: "Local-only posture.",
    note: "openFoundry sends no telemetry. Only providers you explicitly configure can receive requests.",
  },
  templates: {
    title: "Solution templates",
    description: "No templates available yet.",
    note: "Templates will create real agents and endpoints from models that already exist in your workspace.",
  },
  "fine-tune": {
    title: "Fine-tune",
    description: "No training runtime is configured.",
    note: "This build does not bundle a trainer. Dataset export is planned with the evaluation runtime.",
  },
};

export default function ModulePage({ title, kind }: { title: string; kind: string }) {
  const { data } = useApp();
  const copy = COPY[kind] || {
    title,
    description: "This module is not available yet.",
    note: "It will appear in a future build.",
  };
  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Part of the openFoundry workspace.</p>
        </div>
      </div>
      <EmptyState
        title={copy.description}
        description={copy.note}
        illustration={<Wrench20Regular style={{ width: 34, height: 34 }} />}
        action={
          kind === "assets" ? (
            <Link to="/build/agents" className="btn btn-secondary">
              View agents ({data.agents.length})
            </Link>
          ) : kind === "compliance" ? (
            <Link to="/manage" className="btn btn-secondary">Workspace settings</Link>
          ) : undefined
        }
      />
      <div className="banner mt-16">
        <Info20Regular />
        <span>
          openFoundry is built incrementally. Unavailable modules never show fabricated
          data or fake results.
        </span>
      </div>
    </div>
  );
}
