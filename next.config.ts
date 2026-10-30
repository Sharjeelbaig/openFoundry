import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: false,
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
