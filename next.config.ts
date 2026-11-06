import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: false,
  async rewrites() {
    return [
      {
        source: "/.well-known/agent-card.json",
        destination: "/api/a2a/agent-card",
      },
    ];
  },
  outputFileTracingExcludes: {
    "*": [
      "src-tauri/**",
      "data/**",
      ".git/**",
      ".desktop-cache/**",
      ".next/cache/**",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
