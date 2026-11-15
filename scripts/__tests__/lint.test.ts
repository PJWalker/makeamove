import { describe, expect, it } from "vite-plus/test";
import { createLintAnalyses, createLintFixes, runLintChecks } from "../lint";
describe("changed-code lint checks", () => {
  it("autofixes changed JavaScript and TypeScript files with both linters and Knip", () => {
    const checks = createLintFixes([
      "src/example.tsx",
      "src/example.test.ts",
      "package.json",
      "notes.md",
    ]);

    expect(checks.map(({ name }) => name)).toEqual([
      "Oxlint autofix",
      "ESLint autofix",
      "Knip autofix",
    ]);
    const [oxlint, eslint, knip] = checks;
    expect(oxlint?.args).toContain("src/example.tsx");
    expect(oxlint?.args).toContain("--fix");
    expect(eslint?.args).toContain("src/example.tsx");
    expect(eslint?.args).toContain("--fix");
    expect(knip?.args).toContain("--fix");
  });

  it("runs project and changed-code analyses after autofixes", () => {
    const checks = createLintAnalyses(["src/example.tsx", "package.json"]);

    expect(checks.map(({ name }) => name)).toEqual([
      "TypeScript typecheck",
      "Oxlint",
      "ESLint",
      "jscpd",
      "dependency-cruiser",
      "React Doctor",
    ]);
    expect(checks.find(({ name }) => name === "Oxlint")?.args).not.toContain("--fix");
    expect(checks.find(({ name }) => name === "React Doctor")?.args).toContain("--scope");
  });

  it("reports every failure instead of stopping at the first one", () => {
    const output: string[] = [];
    const ran: string[] = [];
    const status = runLintChecks(
      [
        { name: "first", command: "first", args: [] },
        { name: "second", command: "second", args: [] },
      ],
      (check) => {
        ran.push(check.name);
        return {
          status: check.name === "first" ? 1 : 0,
          stdout: "details",
          stderr: "",
        };
      },
      (line) => output.push(line),
    );

    expect(status).toBe(1);
    expect(ran).toEqual(["first", "second"]);
    expect(output.join("\n")).toContain("first: details");
    expect(output.join("\n")).toContain("1 failed");
  });
});
