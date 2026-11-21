import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import promise from "eslint-plugin-promise";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import unicorn from "eslint-plugin-unicorn";
import { defineConfig } from "eslint/config";
import globals from "globals";
import { createRequire } from "node:module";
import reactDoctor from "oxlint-plugin-react-doctor";
import tseslint from "typescript-eslint";
import guardLayer from "./eslint/guardRules.js";
import dataLayer from "./eslint/noRawYjs.js";
import makeamove from "./lint/plugin.ts";

const require = createRequire(import.meta.url);

/** Rules turned on beyond the defaults, kept as data. */
const builtinRules = require("./lint/builtinRules.json").rules;

/** React Doctor's rules, shared with its own CLI (`npm run doctor`). */
const doctorRules = require("./doctor.config.json").rules;

export default defineConfig([
  // What gets linted, for `npm run lint` and the pre-commit hook alike.
  {
    ignores: ["*", "!src/", "!scripts/", "!lint/", "!vite.config.ts"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    ...js.configs.recommended,
    languageOptions: { globals: globals.builtin },
  },
  // JavaScript files sit outside every tsconfig, so they have no type information.
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.eslintRecommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      react,
      "react-hooks": reactHooks,
      "react-doctor": reactDoctor,
      "jsx-a11y": jsxA11y,
      import: importPlugin,
      unicorn,
      promise,
      makeamove,
      data: dataLayer,
      guards: guardLayer,
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": { node: { extensions: [".ts", ".tsx", ".js", ".json"] } },
      "react-doctor": { capabilities: ["react-compiler"] },
    },
    rules: {
      // TypeScript resolves imports (including package `exports`), which eslint-plugin-import can't.
      "import/no-unresolved": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "makeamove/reference-read-only": [
        "error",
        // Config files name reference/ only to leave it out or keep imports from it.
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
    },
  },
  // Code outside the data layer reaches stored values through its typed handles and guards.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/data/**", "**/__tests__/**"],
    rules: {
      "data/no-raw-yjs": "error",
      "guards/guard-boundaries": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-empty": [
        "error",
        {
          allowEmptyCatch: true,
        },
      ],
      "no-implied-eval": "off",
      "no-throw-literal": "off",
      "no-case-declarations": "warn",
      "no-useless-escape": "warn",
      "prefer-promise-reject-errors": "off",
      "require-await": "off",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-namespace": "error",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unnecessary-type-constraint": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-enum-comparison": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/restrict-plus-operands": "error",
      "react/jsx-key": "error",
      "react/jsx-no-comment-textnodes": "error",
      "react/jsx-no-duplicate-props": "error",
      "react/jsx-no-target-blank": "error",
      "react/jsx-no-undef": "error",
      "react/no-danger-with-children": "error",
      "react/no-direct-mutation-state": "error",
      "react/no-find-dom-node": "error",
      "react/no-is-mounted": "error",
      "react/no-render-return-value": "error",
      "react/no-string-refs": "error",
      "react/no-unknown-property": [
        "error",
        {
          ignore: ["closedby"],
        },
      ],
      "react/no-unsafe": "off",
      "react/require-render-return": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "error",
      "react-hooks/use-memo": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/immutability": "error",
      "react-hooks/globals": "error",
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/error-boundaries": "error",
      "react-hooks/purity": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/unsupported-syntax": "warn",
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-ambiguous-text": "off",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-activedescendant-has-tabindex": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/autocomplete-valid": "error",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/control-has-associated-label": [
        "off",
        {
          ignoreElements: ["audio", "canvas", "embed", "input", "textarea", "tr", "video"],
          ignoreRoles: [
            "grid",
            "listbox",
            "menu",
            "menubar",
            "radiogroup",
            "row",
            "tablist",
            "toolbar",
            "tree",
            "treegrid",
          ],
        },
      ],
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/img-redundant-alt": "error",
      "jsx-a11y/interactive-supports-focus": [
        "error",
        {
          tabbable: ["button", "checkbox", "link", "searchbox", "spinbutton", "switch", "textbox"],
        },
      ],
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          controlComponents: ["CommitInput"],
        },
      ],
      "jsx-a11y/media-has-caption": "error",
      "jsx-a11y/mouse-events-have-key-events": "error",
      "jsx-a11y/no-access-key": "error",
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/no-distracting-elements": "error",
      "jsx-a11y/no-interactive-element-to-noninteractive-role": [
        "error",
        {
          tr: ["none", "presentation"],
          canvas: ["img"],
        },
      ],
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-to-interactive-role": [
        "error",
        {
          ul: ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
          ol: ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
          li: ["menuitem", "menuitemradio", "menuitemcheckbox", "option", "row", "tab", "treeitem"],
          table: ["grid"],
          td: ["gridcell"],
          fieldset: ["radiogroup", "presentation"],
        },
      ],
      "jsx-a11y/no-noninteractive-tabindex": "warn",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/scope": "error",
      "jsx-a11y/tabindex-no-positive": "error",
      // Mixed domain exports and component size/complexity are reviewed architecturally, not enforced as lint blockers.
      ...doctorRules,
      ...builtinRules,
      // A switch that ends in `default` handles every other case on purpose.
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
      "no-console": ["error", { allow: ["error"] }],
      "no-restricted-globals": [
        "error",
        ...["localStorage", "sessionStorage", "indexedDB"].map((name) => ({
          name,
          message: "Reach browser storage through src/platform.",
        })),
      ],
      "no-restricted-properties": [
        "error",
        {
          property: "startViewTransition",
          message: "Start view transitions with withTransition or morphOpen (src/ui).",
        },
        ...["localStorage", "sessionStorage", "indexedDB"].map((property) => ({
          object: "window",
          property,
          message: "Reach browser storage through src/platform.",
        })),
      ],
      "makeamove/css-co-located": "error",
      "makeamove/dialog-title-ellipsis": "error",
      "makeamove/no-native-confirmation": "error",
      "makeamove/prefer-guard-helpers": "error",
      "makeamove/prefer-number-parsing": "error",
      "makeamove/prefer-motion-helpers": [
        "error",
        {
          allow: [
            "src/scene/",
            "src/ui/morph.ts",
            "src/table/useDicePool.ts",
            "src/workspace/trackerButtons.ts",
          ],
        },
      ],
      "makeamove/prefer-reduced-motion": "error",
      "makeamove/test-structure": "error",
      "makeamove/title-case": [
        "error",
        {
          jsx: { Button: ["label", "children"], Dialog: ["title"], LobbyModal: ["title"] },
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
          // Surfaces of their own kind: a modal outside any campaign, the
          // command palette and a move's prompt bubble.
          allow: [
            "src/workspace/Dialog.tsx",
            "src/lobby/Lobby.tsx",
            "src/table/Palette.tsx",
            "src/table/MovePrompt.tsx",
          ],
        },
      ],
    },
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["src/**/*.tsx"],
    ignores: ["**/__tests__/**"],
    rules: {
      complexity: ["warn", 57],
      "max-depth": ["warn", 3],
      "max-nested-callbacks": ["warn", 4],
      "max-lines-per-function": ["warn", { max: 531, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: [
      "src/{lib,platform,data,kernel,api,sync,campaign,scene,features,ui,workspace,systems}/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: String.raw`^(\.\.?/)+(app|lobby|table)(/|$)`,
              message: "Only composition (app, lobby, table) may import app, lobby or table.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/table/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: String.raw`^(\.\./)+app(/|$)`,
              message: "The app shell wires the lobby and the table; neither imports it.",
            },
            {
              regex: String.raw`^(\.\./)+lobby(/|$)`,
              message: "The table may not import the lobby.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lobby/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: String.raw`^(\.\./)+app(/|$)`,
              message: "The app shell wires the lobby and the table; neither imports it.",
            },
            {
              regex: String.raw`^(\.\./)+table(/|$)`,
              message: "The lobby may not import the table.",
            },
          ],
        },
      ],
    },
  },
  {
    // The layers that read stored data report what they can't read.
    files: ["src/{data,kernel,platform}/**/*.{ts,tsx}"],
    rules: { "no-console": "off" },
  },
  {
    files: ["src/platform/**/*.{ts,tsx}"],
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },
  {
    files: ["src/ui/transition.ts", "src/ui/morph.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    files: ["src/**/__tests__/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "no-console": "off",
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
    },
  },
  {
    files: ["vite.config.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-namespace": "error",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/no-unnecessary-type-constraint": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
    },
    languageOptions: { globals: globals.node },
  },
]);
