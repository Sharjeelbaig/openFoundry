import {
  Book20Regular,
  Calculator20Regular,
  Document20Regular,
  Globe20Regular,
  PlugConnected20Regular,
  Server20Regular,
  Sparkle20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";
import type { ToolDisplay } from "./tool-options";

export function ToolKindIcon({ tool }: { tool: ToolDisplay }) {
  if (tool.kind === "builtin") {
    if (tool.id === "web-search") return <Globe20Regular />;
    if (tool.id === "file-search") return <Book20Regular />;
    if (tool.id === "calculator") return <Calculator20Regular />;
    return <Wrench20Regular />;
  }
  if (tool.kind === "mcp") return <PlugConnected20Regular />;
  if (tool.kind === "http") return <Globe20Regular />;
  if (tool.kind === "skill") return <Document20Regular />;
  if (tool.kind === "local-skill") return <Sparkle20Regular />;
  if (tool.kind === "toolbox") return <Server20Regular />;
  return <Wrench20Regular />;
}
