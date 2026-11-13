import { configDefaults, defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import { macroPlugins } from "./vite.config";

export default defineConfig({
  plugins: macroPlugins(),
  test: {
    exclude: [...configDefaults.exclude, "tests/**", ".claude/**", ".stryker-tmp/**"],
    browser: {
      provider: playwright(),
      instances: [
        {
          browser: "chromium",
          launch: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
        },
      ],
    },
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "html"],
      // A floor just under current coverage; raise it as coverage grows.
      thresholds: {
        statements: 38,
        branches: 78,
        functions: 66,
        lines: 38,
      },
    },
  },
});
