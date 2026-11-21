import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import dataLayer from "./eslint/noRawYjs.js";

export default defineConfig([
  {
    ignores: [
      "**/__tests__/**",
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "reference/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/data/**", "**/__tests__/**"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { data: dataLayer },
    rules: { "data/no-raw-yjs": "error" },
  },
]);
