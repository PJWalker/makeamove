import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "tests/**", ".claude/**"],
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
