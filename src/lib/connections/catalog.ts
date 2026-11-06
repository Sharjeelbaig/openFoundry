// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Client-safe provider metadata. No secrets, no network code, so the
 * connections page and the source dialog can import it.
 */

export type ConnectionProvider =
  | "s3"
  | "azure-blob"
  | "azure-ai-search"
  | "webdav"
  | "google-drive";

export type ConnectionAuthType =
  | "accessKey"
  | "sasToken"
  | "apiKey"
  | "basic"
  | "oauth2";

export interface ProviderField {
  key: string;
  label: string;
  type: "text" | "password" | "number";
  placeholder?: string;
  required?: boolean;
  help?: string;
}

export interface ProviderSpec {
  id: ConnectionProvider;
  label: string;
  description: string;
  targetLabel: string;
  targetPlaceholder: string;
  authTypes: { id: ConnectionAuthType; label: string }[];
  /** OAuth providers set their own target and are connected in the browser. */
  oauth?: boolean;
  targetFixed?: string;
  /** Non-secret settings stored with the connection. */
  fields: ProviderField[];
  /** Encrypted values. */
  secretFields: ProviderField[];
}

export const CONNECTION_PROVIDERS: Record<ConnectionProvider, ProviderSpec> = {
  s3: {
    id: "s3",
    label: "S3-compatible storage",
    description: "AWS S3, MinIO, Cloudflare R2, Backblaze B2 or Wasabi.",
    targetLabel: "Endpoint",
    targetPlaceholder: "https://s3.us-east-1.amazonaws.com",
    authTypes: [{ id: "accessKey", label: "Access key" }],
    fields: [{ key: "region", label: "Region", type: "text", placeholder: "us-east-1" }],
    secretFields: [
      { key: "accessKeyId", label: "Access key ID", type: "text", required: true },
      { key: "secretAccessKey", label: "Secret access key", type: "password", required: true },
    ],
  },
  "azure-blob": {
    id: "azure-blob",
    label: "Azure Blob Storage",
    description: "A storage account in your own Azure subscription.",
    targetLabel: "Account URL",
    targetPlaceholder: "https://myaccount.blob.core.windows.net",
    authTypes: [{ id: "sasToken", label: "SAS token" }],
    fields: [],
    secretFields: [
      {
        key: "sas",
        label: "SAS token",
        type: "password",
        required: true,
        help: "The query string from the portal, starting with sv= or sig=.",
      },
    ],
  },
  "azure-ai-search": {
    id: "azure-ai-search",
    label: "Azure AI Search",
    description: "An existing search service and its indexes.",
    targetLabel: "Service URL",
    targetPlaceholder: "https://my-service.search.windows.net",
    authTypes: [{ id: "apiKey", label: "API key" }],
    fields: [
      { key: "apiVersion", label: "API version", type: "text", placeholder: "2024-07-01" },
    ],
    secretFields: [
      { key: "apiKey", label: "Admin or query key", type: "password", required: true },
    ],
  },
  "google-drive": {
    id: "google-drive",
    label: "Google Drive",
    description: "My Drive and shared drives, with your own Google OAuth client.",
    targetLabel: "Service URL",
    targetPlaceholder: "https://www.googleapis.com/drive/v3",
    authTypes: [{ id: "oauth2", label: "Google OAuth" }],
    oauth: true,
    targetFixed: "https://www.googleapis.com/drive/v3",
    fields: [
      {
        key: "clientId",
        label: "OAuth client ID",
        type: "text",
        required: true,
        help: "Create an OAuth client (type: Web application) in Google Cloud Console.",
      },
    ],
    secretFields: [
      {
        key: "clientSecret",
        label: "OAuth client secret",
        type: "password",
        required: true,
      },
    ],
  },
  webdav: {
    id: "webdav",
    label: "WebDAV",
    description: "Nextcloud, ownCloud or Box over WebDAV.",
    targetLabel: "Base URL",
    targetPlaceholder: "https://cloud.example.com/remote.php/dav/files/me",
    authTypes: [{ id: "basic", label: "Username and password" }],
    fields: [],
    secretFields: [
      { key: "username", label: "Username", type: "text", required: true },
      { key: "password", label: "Password or app password", type: "password", required: true },
    ],
  },
};

/** Providers that a knowledge source can use today. */
export const ACTIVE_CONNECTION_PROVIDERS: ConnectionProvider[] = [
  "s3",
  "azure-blob",
  "google-drive",
  "webdav",
];

export function providerSpec(provider: ConnectionProvider): ProviderSpec {
  return CONNECTION_PROVIDERS[provider];
}

export function isConnectionProvider(value: string): value is ConnectionProvider {
  return value in CONNECTION_PROVIDERS;
}
