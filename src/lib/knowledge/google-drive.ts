// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import {
  downloadDriveFile,
  driveQuery,
  exportDriveFile,
  exportMime,
  listDriveFiles,
} from "../connections/google";
import type { SourceItem } from "./types";
import { extractBuffer } from "./extract";

const TEXT_MIME = /^(text\/|application\/(json|xml|yaml|x-yaml|javascript|sql|pdf|rtf))/i;

export function validateGoogleDrive(config: Record<string, unknown>): string | null {
  if (!String(config.accessToken || "")) {
    return "Connect this Google Drive connection before syncing.";
  }
  return null;
}

export async function discoverGoogleDrive(
  config: Record<string, unknown>
): Promise<SourceItem[]> {
  const token = String(config.accessToken || "");
  if (!token) throw new Error("Google Drive is not connected.");
  const recursive = config.recursive !== false;
  const maxFiles = Math.min(Number(config.maxFiles) || 500, 2000);
  const maxBytes = Math.min(
    Number(config.maxObjectBytes) || 20 * 1024 * 1024,
    100 * 1024 * 1024
  );

  const items: SourceItem[] = [];
  const folders: string[] = [String(config.folderId || "root")];
  const seenFolders = new Set<string>();

  while (folders.length && items.length < maxFiles) {
    const folderId = folders.shift()!;
    if (seenFolders.has(folderId)) continue;
    seenFolders.add(folderId);

    let pageToken: string | undefined;
    do {
      const page = await listDriveFiles(token, driveQuery(folderId), pageToken);
      for (const file of page.files) {
        if (items.length >= maxFiles) break;
        if (file.mimeType === "application/vnd.google-apps.folder") {
          if (recursive) folders.push(file.id);
          continue;
        }
        const exported = exportMime(file.mimeType);
        if (!exported && !TEXT_MIME.test(file.mimeType)) continue;
        const size = Number(file.size || 0);
        if (!exported && size > maxBytes) {
          items.push({
            externalId: file.id,
            title: file.name,
            mime: "error",
            uri: `gdrive://${file.id}`,
            size,
            content: "",
            metadata: { error: `File is ${size} bytes, over the limit.` },
          });
          continue;
        }
        try {
          let text: string;
          let mime = file.mimeType;
          let extraction = "text";
          if (exported) {
            text = await exportDriveFile(token, file.id, exported);
            mime = exported;
          } else {
            const extracted = await extractBuffer(
              file.name,
              await downloadDriveFile(token, file.id)
            );
            text = extracted.text;
            extraction = extracted.kind;
          }
          if (!text.trim()) continue;
          items.push({
            externalId: file.id,
            title: file.name,
            mime,
            uri: `gdrive://${file.id}`,
            size: Buffer.byteLength(text),
            content: text,
            metadata: {
              driveId: file.id,
              modifiedTime: file.modifiedTime,
              parents: folderId,
              extraction,
            },
          });
        } catch (error) {
          items.push({
            externalId: file.id,
            title: file.name,
            mime: "error",
            uri: `gdrive://${file.id}`,
            size,
            content: "",
            metadata: { error: error instanceof Error ? error.message : String(error) },
          });
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken && items.length < maxFiles);
  }

  return items;
}
