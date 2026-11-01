"use client";

import { useApi } from "@/lib/client";
import ToolCatalog from "@/components/ToolCatalog";
import McpServers from "@/components/McpServers";
import type { Agent } from "@/lib/types";

export default function DiscoverToolsPage() {
  const { data, refresh } = useApi<{ agents: Agent[] }>("/api/agents");

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <ToolCatalog />
      <McpServers agents={data?.agents ?? []} onAgentsChanged={refresh} />
    </div>
  );
}
