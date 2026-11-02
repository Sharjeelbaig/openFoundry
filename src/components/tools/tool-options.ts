import type {
  HttpTool,
  LocalSkill,
  McpServer,
  ToolCatalogEntry,
  Toolbox,
} from "@/lib/types";

export type ToolKind =
  | "builtin"
  | "mcp"
  | "http"
  | "skill"
  | "local-skill"
  | "toolbox"
  | "unknown";

export interface ToolDisplay {
  id: string;
  /** Short id shown above the friendly name, as Foundry does for tool rows. */
  internalId: string;
  name: string;
  description: string;
  type: string;
  kind: ToolKind;
  badge?: string;
}

export interface ToolDisplayContext {
  servers: McpServer[];
  httpTools: HttpTool[];
  localSkills: LocalSkill[];
  catalogSkills: ToolCatalogEntry[];
  toolboxes: Toolbox[];
}

export const BUILTIN_TOOL_DISPLAYS: ToolDisplay[] = [
  {
    id: "web-search",
    internalId: "web_search",
    name: "Web search",
    description:
      "Search the public web from this computer and pass the top results to the model as untrusted context.",
    type: "Built-in",
    kind: "builtin",
  },
  {
    id: "file-search",
    internalId: "file_search",
    name: "File search",
    description:
      "Retrieve grounded chunks from the knowledge bases attached to the agent and cite them in the answer.",
    type: "Built-in",
    kind: "builtin",
  },
  {
    id: "calculator",
    internalId: "calculator",
    name: "Calculator",
    description:
      "Evaluate an arithmetic expression locally with a deterministic parser. No network access.",
    type: "Built-in",
    kind: "builtin",
  },
];

function mcpToolId(server: McpServer, toolName: string): string {
  return `mcp:${server.id}:${toolName}`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function buildToolDisplays(ctx: ToolDisplayContext): ToolDisplay[] {
  const mcp = ctx.servers.flatMap((server) =>
    server.tools.map((tool) => ({
      id: mcpToolId(server, tool.name),
      internalId: tool.name,
      name: tool.name,
      description:
        tool.description || `Tool advertised by ${server.name}.`,
      type:
        server.transport === "stdio"
          ? "Model Context Protocol (MCP) · Local"
          : "Model Context Protocol (MCP)",
      kind: "mcp" as const,
      badge: server.name,
    }))
  );
  const http = ctx.httpTools.map((tool) => ({
    id: `http:${tool.id}`,
    internalId: `http_${slug(tool.name)}`,
    name: tool.name,
    description: tool.description || `${tool.method} ${tool.url}`,
    type: "HTTP tool",
    kind: "http" as const,
    badge: tool.method,
  }));
  const skills = ctx.catalogSkills.map((skill) => ({
    id: `skill:${skill.id}`,
    internalId: `skill_${slug(skill.name)}`,
    name: skill.name,
    description: skill.summary,
    type: "Skill",
    kind: "skill" as const,
  }));
  const localSkills = ctx.localSkills.map((skill) => ({
    id: `skill:local:${skill.id}`,
    internalId: `local_${slug(skill.name)}`,
    name: skill.name,
    description: skill.description || "Local skill",
    type: "Local skill",
    kind: "local-skill" as const,
    badge: skill.source === "uploaded" ? "Uploaded" : "Created",
  }));
  const toolboxes = ctx.toolboxes.map((toolbox) => ({
    id: `toolbox:${toolbox.id}`,
    internalId: toolbox.id,
    name: toolbox.name,
    description:
      toolbox.description ||
      `${toolbox.toolIds.length} included tool${toolbox.toolIds.length === 1 ? "" : "s"}`,
    type: "Toolbox",
    kind: "toolbox" as const,
    badge: `v${toolbox.version || 1}`,
  }));
  return [
    ...BUILTIN_TOOL_DISPLAYS,
    ...mcp,
    ...http,
    ...skills,
    ...localSkills,
    ...toolboxes,
  ];
}

export function describeToolId(
  id: string,
  ctx: ToolDisplayContext
): ToolDisplay {
  const found = buildToolDisplays(ctx).find((item) => item.id === id);
  if (found) return found;

  if (id.startsWith("mcp:")) {
    const [, serverId, ...rest] = id.split(":");
    const server = ctx.servers.find((item) => item.id === serverId);
    return {
      id,
      internalId: rest.join(":") || id,
      name: rest.join(":") || "MCP tool",
      description: server ? `Tool from ${server.name}.` : "MCP tool",
      type: "Model Context Protocol (MCP)",
      kind: "mcp",
    };
  }
  if (id.startsWith("http:")) {
    return {
      id,
      internalId: id,
      name: id.slice(5),
      description: "HTTP tool",
      type: "HTTP tool",
      kind: "http",
    };
  }
  if (id.startsWith("skill:local:")) {
    return {
      id,
      internalId: id.slice("skill:local:".length),
      name: id.slice("skill:local:".length),
      description: "Local skill",
      type: "Local skill",
      kind: "local-skill",
    };
  }
  if (id.startsWith("skill:")) {
    return {
      id,
      internalId: id.slice(6),
      name: id.slice(6),
      description: "Skill",
      type: "Skill",
      kind: "skill",
    };
  }
  if (id.startsWith("toolbox:")) {
    return {
      id,
      internalId: id.slice(8),
      name: id.slice(8),
      description: "Toolbox",
      type: "Toolbox",
      kind: "toolbox",
    };
  }
  return {
    id,
    internalId: id,
    name: id,
    description: "Tool",
    type: "Tool",
    kind: "unknown",
  };
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${Math.round(value)}`;
}

export function formatModified(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
