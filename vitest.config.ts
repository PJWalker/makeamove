import { configDefaults, defineConfig } from "vitest/config";
import { macroPlugins } from "./vite.config";

export default defineConfig({
  plugins: macroPlugins(),
  test: {
    exclude: [...configDefaults.exclude, "tests/**", ".claude/**", ".stryker-tmp/**"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "html"],
      // A floor just under current coverage; raise it as coverage grows.
      thresholds: {
        statements: 40,
        branches: 78,
        functions: 66,
        lines: 40,
      },
    },
  },
});
