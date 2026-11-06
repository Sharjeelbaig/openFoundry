// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { SourceKind, SourceMode } from "./types";

export type FieldType =
  | "text"
  | "password"
  | "number"
  | "boolean"
  | "list"
  | "textarea";

export interface SourceField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  help?: string;
  required?: boolean;
}

export interface CatalogEntry {
  kind: SourceKind;
  label: string;
  mode: SourceMode;
  group: "foundry" | "local" | "cloud";
  description: string;
  /** The source authenticates through a reusable connection of this provider. */
  connectionProvider?:
    | "s3"
    | "azure-blob"
    | "azure-ai-search"
    | "webdav"
    | "google-drive";
  /** False when the connector is not built yet. The picker disables it. */
  available: boolean;
  reason?: string;
  fields: SourceField[];
}

/**
 * One table drives the picker, the dialog fields and the API validation hints.
 * Foundry's order is preserved; local additions follow it.
 */
export const SOURCE_CATALOG: CatalogEntry[] = [
  {
    kind: "work-iq",
    label: "Work IQ",
    mode: "remote",
    group: "foundry",
    description: "Organisational context from Microsoft 365, queried live.",
    available: false,
    reason: "Needs a tenant admin to consent to WorkIQAgent.Ask, plus a Microsoft 365 Copilot licence.",
    fields: [],
  },
  {
    kind: "fabric-data-agent",
    label: "Fabric Data Agent",
    mode: "remote",
    group: "foundry",
    description: "Answers and embedded resources from a Fabric data agent.",
    available: false,
    reason: "Needs a Microsoft Fabric workspace with capacity.",
    fields: [],
  },
  {
    kind: "fabric-ontology",
    label: "Fabric Ontology",
    mode: "remote",
    group: "foundry",
    description: "Entity and relationship answers from a Fabric ontology.",
    available: false,
    reason: "Needs a Microsoft Fabric workspace with capacity.",
    fields: [],
  },
  {
    kind: "azure-blob",
    label: "Azure Blob Storage",
    mode: "indexed",
    group: "foundry",
    description: "Index a container from a storage account you own.",
    available: true,
    connectionProvider: "azure-blob",
    fields: [
      { key: "container", label: "Container", type: "text", required: true },
      { key: "prefix", label: "Prefix", type: "text", placeholder: "docs/" },
    ],
  },
  {
    kind: "web",
    label: "Web",
    mode: "indexed",
    group: "foundry",
    description: "Fetch and index public pages, optionally following same-origin links.",
    available: true,
    fields: [
      { key: "urls", label: "Allowed URLs", type: "list", required: true, placeholder: "https://example.com/docs" },
      { key: "followLinks", label: "Follow same-origin links", type: "boolean" },
      { key: "maxPages", label: "Page limit", type: "number", placeholder: "20" },
    ],
  },
  {
    kind: "azure-ai-search",
    label: "Azure AI Search Index",
    mode: "remote",
    group: "foundry",
    description: "Query an existing search index at retrieval time; nothing is indexed.",
    available: true,
    connectionProvider: "azure-ai-search",
    fields: [
      { key: "index", label: "Index name", type: "text", required: true },
      { key: "contentField", label: "Content field", type: "text", placeholder: "content" },
      { key: "titleField", label: "Title field", type: "text", placeholder: "title" },
      { key: "uriField", label: "URI field", type: "text", placeholder: "metadata_storage_path" },
      { key: "semanticConfiguration", label: "Semantic configuration", type: "text", placeholder: "Optional" },
    ],
  },
  {
    kind: "sharepoint-remote",
    label: "SharePoint (Remote)",
    mode: "remote",
    group: "foundry",
    description: "Query SharePoint live, respecting the signed-in user's permissions.",
    available: false,
    reason: "Needs a Microsoft 365 tenant and an admin-approved app registration.",
    fields: [],
  },
  {
    kind: "sharepoint-indexed",
    label: "SharePoint (Indexed)",
    mode: "indexed",
    group: "foundry",
    description: "Index a SharePoint document library through Microsoft Graph.",
    available: false,
    reason: "Needs a Microsoft 365 tenant and an admin-approved app registration.",
    fields: [],
  },
  {
    kind: "sqlite",
    label: "Azure SQL (local: SQLite)",
    mode: "indexed",
    group: "foundry",
    description: "Index rows from a local SQLite table or view.",
    available: true,
    fields: [
      { key: "path", label: "Database file", type: "text", required: true, placeholder: "/Users/you/data/app.db" },
      { key: "table", label: "Table or view", type: "text", required: true, placeholder: "expenses" },
      { key: "textColumns", label: "Text columns", type: "list", required: true, placeholder: "title, description" },
      { key: "titleColumn", label: "Title column", type: "text", placeholder: "name" },
    ],
  },
  {
    kind: "file",
    label: "File",
    mode: "indexed",
    group: "foundry",
    description: "Upload files directly. No storage account needed.",
    available: true,
    fields: [],
  },
  {
    kind: "mcp",
    label: "MCP Server",
    mode: "remote",
    group: "foundry",
    description: "Call a saved MCP server's tool at retrieval time; nothing is indexed.",
    available: true,
    fields: [
      {
        key: "serverId",
        label: "MCP server",
        type: "text",
        required: true,
        placeholder: "Select a saved MCP server",
        help: "MCP servers are managed under Build → Tools → MCP servers.",
      },
      {
        key: "tool",
        label: "Tool",
        type: "text",
        required: true,
        placeholder: "Select a tool on the server",
      },
      {
        key: "queryArgument",
        label: "Query argument",
        type: "text",
        placeholder: "query",
        help: "The argument name the tool expects for the search text.",
      },
      {
        key: "queryFormat",
        label: "Query format",
        type: "text",
        placeholder: "string",
        help: "Use string for one query, or query_variants for a string array.",
      },
    ],
  },
  {
    kind: "folder",
    label: "Folder",
    mode: "indexed",
    group: "local",
    description: "Index a directory on this computer, with include and exclude globs.",
    available: true,
    fields: [
      { key: "path", label: "Folder path", type: "text", required: true, placeholder: "/Users/you/Documents/knowledge" },
      { key: "include", label: "Include globs", type: "list", help: "Empty means every supported text file." },
      { key: "exclude", label: "Exclude globs", type: "list" },
      { key: "maxFileBytes", label: "Max file size (bytes)", type: "number", placeholder: "20971520" },
    ],
  },
  {
    kind: "sharepoint-export",
    label: "SharePoint / OneDrive export",
    mode: "indexed",
    group: "local",
    description:
      "Index a local folder synced or exported from SharePoint/OneDrive. This is not a live tenant connection.",
    available: true,
    fields: [
      { key: "path", label: "Export folder", type: "text", required: true, placeholder: "/Users/you/SharePoint/Exports" },
      { key: "include", label: "Include globs", type: "list", help: "Empty means every supported text file." },
      { key: "exclude", label: "Exclude globs", type: "list" },
      { key: "maxFileBytes", label: "Max file size (bytes)", type: "number", placeholder: "20971520" },
    ],
  },
  {
    kind: "fabric-export",
    label: "Fabric export (CSV/JSONL)",
    mode: "indexed",
    group: "local",
    description:
      "Index CSV, JSON or JSONL exported from a Fabric lakehouse or warehouse. This is not a live Fabric connection.",
    available: true,
    fields: [
      { key: "path", label: "Export folder", type: "text", required: true, placeholder: "/Users/you/Fabric/Exports" },
      { key: "delimiter", label: "CSV delimiter", type: "text", placeholder: "," },
      { key: "titleColumn", label: "Title column", type: "text", placeholder: "name" },
      { key: "maxRows", label: "Row limit", type: "number", placeholder: "5000" },
    ],
  },
  {
    kind: "git",
    label: "Git repository",
    mode: "indexed",
    group: "local",
    description: "Index tracked text files from a local checkout.",
    available: true,
    fields: [
      { key: "path", label: "Repository path", type: "text", required: true, placeholder: "/Users/you/code/project" },
    ],
  },
  {
    kind: "csv",
    label: "CSV file",
    mode: "indexed",
    group: "local",
    description: "Index rows from a CSV file, one document per row.",
    available: true,
    fields: [
      { key: "path", label: "CSV path", type: "text", required: true, placeholder: "/Users/you/data/rows.csv" },
      { key: "delimiter", label: "Delimiter", type: "text", placeholder: "," },
      { key: "titleColumn", label: "Title column", type: "text", placeholder: "name" },
    ],
  },
  {
    kind: "s3",
    label: "S3-compatible storage",
    mode: "indexed",
    group: "cloud",
    description: "AWS S3, MinIO, Cloudflare R2, Backblaze B2 or Wasabi.",
    available: true,
    connectionProvider: "s3",
    fields: [
      { key: "bucket", label: "Bucket", type: "text", required: true },
      { key: "prefix", label: "Prefix", type: "text", placeholder: "docs/" },
    ],
  },
  {
    kind: "google-drive",
    label: "Google Drive",
    mode: "indexed",
    group: "cloud",
    description: "My Drive and shared drives, through your own Google OAuth client.",
    available: true,
    connectionProvider: "google-drive",
    fields: [
      {
        key: "folderId",
        label: "Folder ID",
        type: "text",
        placeholder: "1AbC... (leave empty for My Drive root)",
        help: "The ID from the folder URL: drive.google.com/drive/folders/<id>.",
      },
      { key: "recursive", label: "Include subfolders", type: "boolean" },
      { key: "maxFiles", label: "File limit", type: "number", placeholder: "500" },
    ],
  },
  {
    kind: "gcs",
    label: "Google Cloud Storage",
    mode: "indexed",
    group: "cloud",
    description: "Index a bucket with a service account.",
    available: false,
    reason: "Connector not built yet.",
    fields: [],
  },
  {
    kind: "webdav",
    label: "WebDAV",
    mode: "indexed",
    group: "cloud",
    description: "Nextcloud, ownCloud or Box over WebDAV.",
    available: true,
    connectionProvider: "webdav",
    fields: [
      { key: "path", label: "Subfolder", type: "text", placeholder: "Documents/policies" },
      { key: "maxFiles", label: "File limit", type: "number", placeholder: "500" },
    ],
  },
  {
    kind: "sftp",
    label: "SFTP",
    mode: "indexed",
    group: "cloud",
    description: "Index a directory on a remote server over SFTP.",
    available: false,
    reason: "Connector not built yet.",
    fields: [],
  },
  {
    kind: "onelake",
    label: "OneLake Catalog",
    mode: "indexed",
    group: "foundry",
    description: "Index a lakehouse in Microsoft Fabric.",
    available: false,
    reason: "Needs a Microsoft Fabric workspace with capacity.",
    fields: [],
  },
];

export function catalogEntry(kind: SourceKind): CatalogEntry | undefined {
  return SOURCE_CATALOG.find((entry) => entry.kind === kind);
}

/** Human label used in the source list. */
export function sourceLabel(kind: SourceKind): string {
  return catalogEntry(kind)?.label || kind;
}
