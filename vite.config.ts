import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "rules-dnd-classes",
              test: /[/\\]reference[/\\]dnd-5\.5e-srd[/\\]classes\.md/,
            },
            {
              name: "rules-dnd-feats",
              test: /[/\\]reference[/\\]dnd-5\.5e-srd[/\\]feats\.md/,
            },
            {
              name: "rules-dnd-items",
              test: /[/\\]reference[/\\]dnd-5\.5e-srd[/\\]magic-items\.md/,
            },
            {
              name: "rules-dnd-monsters",
              test: /[/\\]reference[/\\]dnd-5\.5e-srd[/\\]monsters-A-Z\.md/,
            },
            {
              name: "rules-dnd-spells",
              test: /[/\\]reference[/\\]dnd-5\.5e-srd[/\\]spells\.md/,
            },
            {
              name: "rules-daggerheart",
              test: /[/\\]reference[/\\]daggerheart-srd-main[/\\]/,
            },
            {
              name: "rules-dungeon-world-2",
              test: /[/\\]reference[/\\]Dungeon World 2 Beta v3\.md/,
            },
            {
              name: "rules-blades",
              test: /[/\\]reference[/\\]Blades-in-the-Dark-SRD\.md/,
            },
          ],
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [["module:@preact/signals-react-transform", { mode: "all" }]],
      },
    }),
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
