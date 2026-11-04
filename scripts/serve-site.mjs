// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "landing");
const port = Number(process.env.PORT || 4321);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const relative =
    pathname === "/"
      ? "index.html"
      : pathname.endsWith("/")
        ? `${pathname.replace(/^\/+/, "")}index.html`
        : pathname.replace(/^\/+/, "");
  const file = path.join(root, relative);

  if (!file.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(file);
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving landing/ at http://localhost:${port}`);
});
