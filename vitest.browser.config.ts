import { configDefaults, defineConfig, mergeConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    optimizeDeps: {
      noDiscovery: true,
      include: [
        "react",
        "react/compiler-runtime",
        "react-dom",
        "react-dom/client",
        "react-dom/server",
        "pixi.js",
        "eventemitter3",
        "react-aria",
        "react-aria-components",
        "yjs",
        "y-indexeddb",
        "fractional-indexing",
        "@tiptap/y-tiptap",
        "@tiptap/core",
        "@tiptap/extension-collaboration",
        "@tiptap/extension-mention",
        "@tiptap/extension-placeholder",
        "@tiptap/starter-kit",
        "@tiptap/extension-collaboration-caret",
        "@tiptap/static-renderer/pm/react",
        "lib0/decoding",
        "lib0/encoding",
        "y-protocols/awareness",
        "y-protocols/sync",
        "trystero",
        "fuse.js",
        "@floating-ui/dom",
      ],
    },
    test: {
      include: ["tests/**/*.spec.ts"],
      exclude: configDefaults.exclude,
      fileParallelism: false,
      maxWorkers: 1,
      expect: { poll: { timeout: 10_000, interval: 25 } },
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [
          {
            browser: "chromium",
            launch: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
          },
        ],
      },
    },
  }),
);
