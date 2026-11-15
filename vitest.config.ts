import { configDefaults, defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import { macroPlugins } from "./vite.config";

export default defineConfig({
  plugins: macroPlugins(),
  test: {
    isolate: false,
    environment: "happy-dom",
    exclude: [...configDefaults.exclude, "tests/**", ".claude/**"],
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
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.macro.ts"],
      reporter: ["text-summary", "html"],
      // Keep these floors just below the current baseline and raise them as coverage grows.
      thresholds: {
        statements: 34,
        branches: 30,
        functions: 31,
        lines: 34,
      },
    },
  },
});
