import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // This app fetches local JSON APIs from client components and stores the
  // results in state. That is the intended pattern here, so the React Compiler
  // advisory rules that flag those effects and manual memoization are disabled.
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src-tauri/**",
    "scripts/**",
    ".desktop-cache/**",
  ]),
]);

export default eslintConfig;
