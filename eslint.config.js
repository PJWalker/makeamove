import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import";
import unicorn from "eslint-plugin-unicorn";
import promise from "eslint-plugin-promise";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import dataLayer from "./eslint/noRawYjs.js";
import guardLayer from "./eslint/guardRules.js";
import makeamove from "./lint/plugin.ts";

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
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    ...js.configs.recommended,
  },
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      react,
      "jsx-a11y": jsxA11y,
      import: importPlugin,
      unicorn,
      promise,
      "react-hooks": reactHooks,
      makeamove,
      data: dataLayer,
      guards: guardLayer,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      ...importPlugin.configs.recommended.rules,
      ...unicorn.configs.recommended.rules,
      ...promise.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/restrict-plus-operands": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
      "data/no-raw-yjs": "error",
      "guards/guard-boundaries": "error",
      "makeamove/css-co-located": "error",
      "makeamove/dialog-title-ellipsis": "error",
      "makeamove/no-native-confirmation": "error",
      "makeamove/prefer-guard-helpers": "error",
      "makeamove/prefer-number-parsing": "error",
      "makeamove/prefer-motion-helpers": "error",
      "makeamove/prefer-reduced-motion": "error",
      "makeamove/reference-read-only": [
        "error",
        {
          allow: [
            "scripts/rules/readReference.ts",
            "lint/",
            "vite.config.ts",
            "eslint.config.js",
            ".dependency-cruiser.cjs",
          ],
        },
      ],
      "makeamove/title-case": [
        "error",
        {
          jsx: { Button: ["label", "children"], Dialog: ["title"] },
          objects: [
            { with: ["id", "run"], check: ["title"] },
            { with: ["onSelect"], check: ["label"] },
            { with: ["onPick"], check: ["label"] },
            { with: ["confirmLabel"], check: ["title", "confirmLabel"] },
          ],
        },
      ],
      "makeamove/use-dialog": [
        "error",
        {
          allow: [
            "src/workspace/Dialog.tsx",
            "src/lobby/Lobby.tsx",
            "src/table/Palette.tsx",
            "src/table/MovePrompt.tsx",
          ],
        },
      ],
    },
  },
]);
