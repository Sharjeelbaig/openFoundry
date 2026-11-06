// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { MetadataRoute } from "next";

/**
 * Installable web-app manifest. The same workspace is served by the desktop
 * app, a Termux-hosted server, or a LAN server; installing it adds a home-screen
 * app without shipping a separate native binary.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "openFoundry",
    short_name: "openFoundry",
    description:
      "A local AI workbench for models, agents, knowledge and guardrails.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0f0f0f",
    theme_color: "#643fb2",
    categories: ["developer", "productivity"],
    icons: [
      {
        src: "/brand/openfoundry-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/openfoundry-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/openfoundry-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Agents", url: "/build/agents" },
      { name: "Playground", url: "/playground" },
      { name: "Knowledge", url: "/build/knowledge/search" },
    ],
  };
}
