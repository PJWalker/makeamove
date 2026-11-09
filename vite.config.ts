import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";
import { createJiti, type Jiti } from "jiti";
import { fileURLToPath } from "node:url";
import Macros from "unplugin-macros/vite";
import { defineConfig, type Plugin } from "vite";
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
      resolveId(source, importer) {
        const buildTime = importer?.includes("/__tests__/") || /\.macro\.ts$/.test(importer ?? "");
        if (/\.macro(\.ts)?$/.test(source) && !buildTime)
          this.error(
            `${source} is a build-time macro: import it with { type: "macro" } (${importer})`,
          );
      },
    },
  ];
}

export default defineConfig({
  base: process.env.PAGES_BASE_PATH || "/",
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
  plugins: [
    ...macroPlugins(),
    react({ babel: { plugins: ["babel-plugin-react-compiler"] } }),
    // Icons are compiled into the bundle from local Iconify data, so they work offline.
    Icons({ compiler: "jsx", jsx: "react", scale: 1 }),
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
  ],
});
