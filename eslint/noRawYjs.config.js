import { defineConfig } from "eslint/config";
import { fileURLToPath } from "node:url";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import dataLayer from "./noRawYjs.js";
import guardLayer from "./guardRules.js";

export default defineConfig([
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/data/**", "**/__tests__/**"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: fileURLToPath(new URL("..", import.meta.url)),
      },
    },
    plugins: { data: dataLayer, guards: guardLayer, "react-hooks": reactHooks },
    rules: {
      "data/no-raw-yjs": "error",
      "guards/guard-boundaries": "error",
    },
  },
]);
