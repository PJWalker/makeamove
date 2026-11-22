import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createJiti  } from "jiti";
import type {Jiti} from "jiti";
import Macros from "unplugin-macros/vite";
import { defineConfig,  lazyPlugins } from "vite-plus";
import type {Plugin} from "vite-plus";
import { VitePWA } from "vite-plugin-pwa";

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
          for (const key of Object.keys(jiti.cache)) Reflect.deleteProperty(jiti.cache, key);
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
        const buildTime =
          importer !== undefined &&
          (importer.includes("/__tests__/") || importer.endsWith(".macro.ts"));
        if (source.endsWith(".macro") || source.endsWith(".macro.ts")) {
          if ("scan" in options && options.scan === true) return { id: source, external: true };
          if (!buildTime)
            this.error(
              `${source} is a build-time macro: import it with { type: "macro" } (${importer ?? "entry"})`,
            );
        }
        return;
      },
    },
  ];
}

export default defineConfig({
  // The same checks as `npm run lint`, through its own scripts so the two can't drift apart.
  // The typecheck covers the whole project, so takes no files.
  // React Doctor's rules run inside ESLint; its full scan (`npm run doctor`) is left to `npm run lint`.
  staged: {
    "*": ["npm run lint:eslint", () => "npm run typecheck"],
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
  base: (process.env["PAGES_BASE_PATH"] ?? "") || "/",
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
