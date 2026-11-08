import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import storybook from "eslint-plugin-storybook";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
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
    files: ["src/**/*.{ts,tsx}", ".storybook/preview.tsx"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      react.configs.flat.recommended,
      react.configs.flat["jsx-runtime"],
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
      "no-case-declarations": "warn",
      // `closedby` is a standard <dialog> attribute React doesn't know yet.
      "react/no-unknown-property": ["error", { ignore: ["closedby"] }],
      "react/no-unescaped-entities": "warn",
      "react/display-name": "warn",
      "react/prop-types": "off",
      // Dialogs, menus and inline renames deliberately move focus in when they open.
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/no-noninteractive-tabindex": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
    },
    settings: {
      react: { version: "detect" },
    },
  },
  // Imports flow downward (design.md#modules): composition (app, lobby, table) may use
  // everything below it; nothing below reaches back up. Tests compose freely.
  {
    files: [
      "src/{lib,core,platform,sync,campaign,scene,features,ui,workspace,systems}/**/*.{ts,tsx}",
      "src/graphics.ts",
    ],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(\\.\\.?/)+(app|lobby|table)(/|$)",
              message: "Only composition (app, lobby, table) may import app, lobby or table.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/table/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(\\.\\./)+app/(?!router$)",
              message: "Only app/router is shared with the lobby and the table.",
            },
            {
              regex: "^(\\.\\./)+lobby(/|$)",
              message: "The table may not import the lobby.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lobby/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(\\.\\./)+app/(?!router$)",
              message: "Only app/router is shared with the lobby and the table.",
            },
            {
              regex: "^(\\.\\./)+table(/|$)",
              message: "The lobby may not import the table.",
            },
          ],
        },
      ],
    },
  },
  ...storybook.configs["flat/recommended"],
  {
    files: ["vite.config.ts", ".storybook/main.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
