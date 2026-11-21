import react from "@vitejs/plugin-react";
import { createJiti, type Jiti } from "jiti";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Macros from "unplugin-macros/vite";
import { defineConfig, type Plugin, lazyPlugins } from "vite-plus";
import { VitePWA } from "vite-plugin-pwa";

/**
 * oxlint's built-in rules the code follows beyond those set below, so new
 * code keeps to them too. Each is on because the code already passes it.
 */
const builtinRules = (
  createRequire(import.meta.url)("./lint/builtinRules.json") as {
    rules: Record<string, "error" | "warn" | "off">;
  }
).rules;

const doctorRules = (
  createRequire(import.meta.url)("./doctor.config.json") as {
    rules: Record<string, "error" | "warn" | "off">;
  }
).rules;

/**
 * Build-time macros (`import … with { type: "macro" }`), such as markdown
 * rules text turned into rich text. A *.macro.ts module imported any other
 * way would ship its build-only code to the browser, so that fails the build.
 */
export function macroPlugins(): Plugin[] {
  // Macro modules are ordinary app TypeScript (extensionless imports and all),
  // so jiti loads them. A change to any file drops the whole cache: macros
  // re-run against fresh code.
  const jiti: Jiti = createJiti(import.meta.url);
  const loaded = new Set<string>();
  return [
    Macros({
      runner: {
        resolve: (source, importer) => fileURLToPath(jiti.esmResolve(source, importer)),
        import: (resolved) => {
          loaded.add(resolved);
          return jiti.import<Record<string, unknown>>(resolved);
        },
        invalidate: () => {
          for (const key of Object.keys(jiti.cache)) delete jiti.cache[key];
          const stale = [...loaded];
          loaded.clear();
          return stale;
        },
      },
    }),
    {
      name: "macros-only-at-build-time",
      enforce: "pre",
      // Tests run in Node, so they may call a macro's functions directly, and
      // macro modules may use each other.
      resolveId(source, importer, options) {
        const buildTime = importer?.includes("/__tests__/") || importer?.endsWith(".macro.ts");
        if (source.endsWith(".macro") || source.endsWith(".macro.ts")) {
          if ("scan" in options && options.scan) return { id: source, external: true };
          if (!buildTime)
            this.error(
              `${source} is a build-time macro: import it with { type: "macro" } (${importer})`,
            );
        }
        return undefined;
      },
    },
  ];
}

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    settings: {
      "react-doctor": { capabilities: ["react-compiler"] },
    },
    env: {
      builtin: true,
    },
    ignorePatterns: [
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "reference/**",
    ],
    overrides: [
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
          "no-unused-vars": [
            "error",
            {
              argsIgnorePattern: "^_",
              varsIgnorePattern: "^_",
            },
          ],
          "no-case-declarations": "warn",
          "no-useless-escape": "warn",
          "prefer-promise-reject-errors": "off",
          "require-await": "off",
          "typescript/ban-ts-comment": "error",
          "typescript/no-empty-object-type": "warn",
          "typescript/no-explicit-any": "error",
          "typescript/no-misused-promises": "error",
          "typescript/no-namespace": "error",
          "typescript/no-require-imports": "error",
          "typescript/no-unnecessary-type-assertion": "error",
          "typescript/no-unnecessary-type-constraint": "error",
          "typescript/no-unsafe-argument": "error",
          "typescript/no-unsafe-assignment": "error",
          "typescript/no-unsafe-call": "error",
          "typescript/no-unsafe-enum-comparison": "error",
          "typescript/no-unsafe-function-type": "error",
          "typescript/no-unsafe-member-access": "error",
          "typescript/no-unsafe-return": "error",
          "typescript/only-throw-error": "error",
          "typescript/prefer-promise-reject-errors": "error",
          "typescript/require-await": "error",
          "typescript/restrict-plus-operands": "error",
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
          "react/rules-of-hooks": "error",
          "react/exhaustive-deps": "warn",
          "react/static-components": "error",
          "react/use-memo": "error",
          "react/preserve-manual-memoization": "error",
          "react/incompatible-library": "warn",
          "react/immutability": "error",
          "react/globals": "error",
          "react/refs": "error",
          "react/set-state-in-effect": "error",
          "react/error-boundaries": "error",
          "react/purity": "error",
          "react/set-state-in-render": "error",
          "react/unsupported-syntax": "warn",
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
              tabbable: [
                "button",
                "checkbox",
                "link",
                "searchbox",
                "spinbutton",
                "switch",
                "textbox",
              ],
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
              li: [
                "menuitem",
                "menuitemradio",
                "menuitemcheckbox",
                "option",
                "row",
                "tab",
                "treeitem",
              ],
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
          "makeamove/dialog-title-ellipsis": "error",
          "makeamove/prefer-reduced-motion": "error",
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
        plugins: [
          "react",
          "jsx-a11y",
          "import",
          "promise",
          "react-perf",
          "unicorn",
          "typescript",
          "oxc",
        ],
        jsPlugins: ["oxlint-plugin-react-doctor"],
        env: {
          browser: true,
        },
      },
      {
        files: ["src/**/*.tsx"],
        excludeFiles: ["**/__tests__/**"],
        rules: {
          complexity: ["warn", 57],
          "max-depth": ["warn", 3],
          "max-nested-callbacks": ["warn", 4],
          "max-lines-per-function": [
            "warn",
            { max: 531, skipBlankLines: false, skipComments: false },
          ],
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
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  regex: "^(\\.\\./)+app(/|$)",
                  message: "The app shell wires the lobby and the table; neither imports it.",
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
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  regex: "^(\\.\\./)+app(/|$)",
                  message: "The app shell wires the lobby and the table; neither imports it.",
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
          "typescript/ban-ts-comment": "error",
          "typescript/no-empty-object-type": "error",
          "typescript/no-explicit-any": "error",
          "typescript/no-namespace": "error",
          "typescript/no-require-imports": "error",
          "typescript/no-unnecessary-type-constraint": "error",
          "typescript/no-unsafe-function-type": "error",
        },
        env: {
          node: true,
        },
      },
    ],
    jsPlugins: [
      {
        name: "react-hooks-js",
        specifier: "eslint-plugin-react-hooks",
      },
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
      {
        name: "makeamove",
        specifier: "./lint/plugin.ts",
      },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
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
  fmt: {
    printWidth: 100,
    sortPackageJson: false,
    ignorePatterns: [
      "dist",
      "dev-dist",
      "coverage",
      "playwright-report",
      "test-results",
      "blob-report",
      "reference",
      "public",
      "package-lock.json",
      "skills-lock.json",
      "*.md",
      ".agents",
      ".claude",
      ".playwright*",
      ".vscode",
      "src/systems/dnd55e/srd",
      "src/systems/blades-in-the-dark/abilities.json",
      "src/systems/dungeon-world-2/rulebook.json",
    ],
  },
  base: process.env["PAGES_BASE_PATH"] || "/",
  server: {
    hmr: false,
  },
  optimizeDeps: {
    entries: ["index.html"],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Each rulebook's parsed rules (inlined at build time) in a chunk of its own.
          groups: [
            {
              name: "rules-dnd-classes",
              test: /[/\\]dnd55e[/\\]srdClasses\.ts/,
            },
            {
              name: "rules-dnd-feats",
              test: /[/\\]dnd55e[/\\]srdFeats\.ts/,
            },
            {
              name: "rules-dnd-items",
              test: /[/\\]dnd55e[/\\]srdMagicItems\.ts/,
            },
            {
              name: "rules-dnd-monsters",
              test: /[/\\]dnd55e[/\\]srdMonsters\.ts/,
            },
            {
              name: "rules-dnd-spells",
              test: /[/\\]dnd55e[/\\]srdSpells\.ts/,
            },
            {
              name: "rules-dungeon-world-2",
              test: /[/\\]dungeon-world-2[/\\](paths|creationHints|bonds|struggles)\.ts/,
            },
            {
              name: "rules-blades",
              test: /[/\\]blades-in-the-dark[/\\]content\.ts/,
            },
          ],
        },
      },
    },
  },
  plugins:
    lazyPlugins(() => [
      ...macroPlugins(),
      react({ babel: { plugins: ["babel-plugin-react-compiler"] } }),
      VitePWA({
        registerType: "autoUpdate",
        // The glob below already precaches every icon; don't list them twice.
        includeManifestIcons: false,
        manifest: {
          name: "Make a Move",
          short_name: "Make a Move",
          description: "A virtual tabletop.",
          theme_color: "#14161c",
          background_color: "#14161c",
          display: "standalone",
          icons: [
            {
              src: "icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any",
            },
            {
              src: "icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts" },
            },
          ],
        },
      }),
    ]) ?? [],
});
