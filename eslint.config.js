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
      "reports/**",
      ".stryker-tmp/**",
      "storybook-static/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/data/**", "**/__tests__/**", "**/*.stories.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { data: dataLayer },
    rules: { "data/no-raw-yjs": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "vite.config.ts", ".storybook/**/*.{ts,tsx}"],
    ignores: ["scripts/rules/readReference.ts"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|[/\\\\])reference[/\\\\]/]",
          message: "reference/ is read only by scripts/rules/readReference.ts.",
        },
        {
          selector: "TemplateElement[value.raw=/(^|[/\\\\])reference[/\\\\]/]",
          message: "reference/ is read only by scripts/rules/readReference.ts.",
        },
      ],
    },
  },
]);
