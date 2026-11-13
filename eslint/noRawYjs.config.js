import { defineConfig } from "eslint/config";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";
import dataLayer from "./noRawYjs.js";

export default defineConfig([
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/data/**", "**/__tests__/**", "**/*.stories.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: fileURLToPath(new URL("..", import.meta.url)),
      },
    },
    plugins: { data: dataLayer },
    rules: { "data/no-raw-yjs": "error" },
  },
]);
