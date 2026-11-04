// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft20Regular,
  Document20Regular,
  Info20Regular,
  PlugConnected20Regular,
  Server20Regular,
  Warning20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import {
  ToolDetail,
  authLabels,
  availabilityLabel,
  providerOf,
  registryOf,
  typeIcon,
  type HttpDraft,
} from "@/components/ToolCatalog";
import type { Agent, McpServer, ToolCatalogEntry, ToolSetup } from "@/lib/types";

interface ToolProfileProps {
  entry: ToolCatalogEntry;
  setup: ToolSetup | null;
}

/** Full detail page for connector, remote MCP and local MCP entries. */
export default function ToolProfile({ entry, setup }: ToolProfileProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");
  const { data: mcpData, refresh: refreshMcp } = useApi<{ servers: McpServer[] }>(
    "/api/mcp",
    15000
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const [busy, setBusy] = useState("");

  const agents = agentData?.agents ?? [];

  const existingServer = useMemo(
    () =>
      (mcpData?.servers ?? []).find(
        (server) =>
          server.name === entry.name ||
          (server.transport === "http" && server.url === entry.remoteUrl)
      ),
    [mcpData?.servers, entry.name, entry.remoteUrl]
  );

  const connectMcp = async (headers: Record<string, string> = {}) => {
    if (!entry.remoteUrl) {
      toast(
        "This catalog entry does not publish a remote endpoint. Use the local MCP setup in Build → Tools.",
        "error"
      );
      return;
    }
    if (existingServer && Object.keys(headers).length === 0) {
      toast(
        `${entry.name} is already registered. Add credentials here and connect again, or edit it in Build → Tools.`,
        "info"
      );
      return;
    }
    setBusy("mcp");
    try {
      const res = await fetch(
        existingServer
          ? `/api/mcp/${encodeURIComponent(existingServer.id)}`
          : "/api/mcp",
        {
          method: existingServer ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: entry.name,
            transport: "http",
            url: entry.remoteUrl,
            headers,
          }),
        }
      );
      const json = (await res.json()) as { server?: McpServer; error?: string };
      if (!res.ok)
        throw new Error(json.error || "Could not register the MCP server.");
      refreshMcp();
      if (json.server?.status === "Error") {
        toast(
          `Server saved, but the connection failed: ${
            json.server.error || "check the endpoint."
          }`,
          "error"
        );
      } else {
        toast(
          `${entry.name} connected with ${json.server?.tools.length || 0} tools.`,
          "success"
        );
        setConnectOpen(false);
      }
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "MCP connection failed.",
        "error"
      );
    } finally {
      setBusy("");
    }
  };

  const createHttpTool = async (draft: HttpDraft) => {
    setBusy("http");
    try {
      const res = await fetch("/api/http-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await res.json()) as {
        tool?: { name: string };
        error?: string;
      };
      if (!res.ok)
        throw new Error(json.error || "Could not create the HTTP tool.");
      toast(`${json.tool?.name || draft.name} created`, "success");
      setConnectOpen(false);
      router.push("/build/tools?tab=tools");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not create the HTTP tool.",
        "error"
      );
    } finally {
      setBusy("");
    }
  };

  const release = entry.releaseDate
    ? new Date(entry.releaseDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not stated";
  const auth = authLabels(entry.auth);
  const provider = providerOf(entry);
  const thirdParty =
    provider !== "Microsoft" &&
    provider !== "Independent" &&
    provider !== "Other publishers";
  const docs = entry.docs ?? [];

  return (
    <div className="page tool-profile">
      <Link href="/discover/tools" className="tool-profile-back">
        <ArrowLeft20Regular /> Tools
      </Link>

      <div className="tool-profile-head">
        <span className="tool-profile-icon">{typeIcon(entry.type)}</span>
        <h1 className="tool-profile-title">{entry.name}</h1>
        <button
          className="btn btn-primary tool-profile-cta"
          onClick={() => setConnectOpen(true)}
        >
          {entry.availability === "http" ? (
            <Wrench20Regular />
          ) : entry.availability === "mcp-local" ? (
            <Server20Regular />
          ) : (
            <PlugConnected20Regular />
          )}
          {entry.availability === "mcp-local" ? "Set up locally" : "Connect"}
        </button>
      </div>

      <p className="tool-profile-summary">{entry.summary}</p>

      {thirdParty && (
        <div className="tool-profile-warning">
          <Warning20Regular />
          <div>
            <strong>Third-party tool</strong>
            <p>
              Non-Microsoft tools are third-party products. Use them at your own
              risk and under their own terms and data-handling practices.{" "}
              <Link href="/terms">Learn more</Link>
            </p>
          </div>
        </div>
      )}

      <hr className="tool-profile-divider" />

      <div className="tool-profile-layout">
        <div className="tool-profile-main">
          {entry.description && entry.description !== entry.summary && (
            <section>
              <h2>About this tool</h2>
              <p>{entry.description}</p>
            </section>
          )}

          {Boolean(entry.categories?.length || entry.tags?.length) && (
            <section>
              <h2>Capabilities</h2>
              <div className="tool-profile-tags">
                {[...entry.categories, ...entry.tags].map((tag) => (
                  <span className="badge gray" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2>How openFoundry uses it</h2>
            {entry.availability === "mcp" ? (
              <p>
                Connect registers the published endpoint as a local MCP server in
                this workspace. Your models can then call its tools from chat and
                from agents you build. The connection runs from this machine;
                nothing is provisioned in a cloud subscription.
              </p>
            ) : entry.availability === "mcp-local" ? (
              <p>
                This entry describes a local MCP server. openFoundry does not
                download or host it: install or run the server on this machine,
                then register its command in Build → Tools. The catalog entry is
                metadata only.
              </p>
            ) : (
              <p>
                The catalog entry is metadata only. openFoundry offers a local
                HTTP-tool alternative: add the provider&apos;s API base URL and
                your own credentials in Build → Tools, then attach the tool to an
                agent.
              </p>
            )}
          </section>

          {setup?.operations?.length ? (
            <section>
              <h2>Operations</h2>
              <div className="tool-profile-ops">
                {setup.operations.map((operation) => (
                  <div className="tool-profile-op" key={operation.id}>
                    <span className="badge gray">{operation.method}</span>
                    <span className="mono text-12">{operation.path}</span>
                    <span className="muted text-12">{operation.name}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {docs.length > 0 && (
            <section>
              <h2>Documentation</h2>
              <div className="tool-profile-docs">
                {docs.map((doc) => (
                  <a
                    key={doc.url}
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Document20Regular /> {doc.title}
                  </a>
                ))}
              </div>
              <p className="muted text-12" style={{ marginTop: 8 }}>
                Documentation is hosted and controlled by the publisher.
              </p>
            </section>
          )}

          <section>
            <h2>Legal</h2>
            <p className="muted text-12">
              {entry.name} and its marks belong to {provider}. openFoundry is an
              independent local index and is not affiliated with, endorsed by or
              sponsored by the publisher. Tool names and documentation links are
              used only to identify the tool.
            </p>
          </section>
        </div>

        <aside className="tool-profile-facts">
          <h2>Quick facts</h2>
          <div className="tool-profile-fact">
            <span>Tool provider</span>
            <span>{provider}</span>
          </div>
          <div className="tool-profile-fact">
            <span>Type</span>
            <span>{entry.type}</span>
          </div>
          <div className="tool-profile-fact">
            <span>Release date</span>
            <span>{release}</span>
          </div>
          <div className="tool-profile-fact">
            <span>Lifecycle</span>
            <span>{entry.preview ? "Preview" : "Generally available"}</span>
          </div>
          <div className="tool-profile-fact">
            <span>Authentication types</span>
            <span>{auth.join(", ")}</span>
          </div>
          <div className="tool-profile-fact">
            <span>Registry</span>
            <span>{registryOf(entry)}</span>
          </div>
          <div className="tool-profile-fact">
            <span>Local action</span>
            <span>
              {availabilityLabel(entry)}
              {existingServer ? " · connected" : ""}
            </span>
          </div>
        </aside>
      </div>

      <div className="tool-profile-note">
        <Info20Regular />
        <span>
          openFoundry does not bundle vendor icons, connector operation tables or
          hosted gateway credentials. Bring your own provider credentials.
        </span>
      </div>

      {connectOpen && (
        <ToolDetail
          entry={entry}
          setup={setup}
          setupLoading={false}
          setupError=""
          existingServer={existingServer}
          agents={agents}
          agentId=""
          setAgentId={() => {}}
          busy={busy}
          onClose={() => setConnectOpen(false)}
          onAddSkill={() => {}}
          onConnectMcp={(headers) => void connectMcp(headers)}
          onCreateHttpDraft={(draft) => void createHttpTool(draft)}
        />
      )}
    </div>
  );
}
