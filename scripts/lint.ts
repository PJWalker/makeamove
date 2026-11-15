import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

export interface LintCheck {
  name: string;
  command: string;
  args: string[];
}

export interface LintResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

const CODE_FILE = /\.(?:[cm]?[jt]sx?|css)$/i;
const ESLINT_FILE = /\.(?:[cm]?[jt]sx?)$/i;

export function createLintFixes(files: string[]): LintCheck[] {
  const codeFiles = files.filter((file) => CODE_FILE.test(file));
  const eslintFiles = codeFiles.filter((file) => ESLINT_FILE.test(file));
  const checks: LintCheck[] = [];

  if (codeFiles.length > 0) {
    checks.push({
      name: "Oxlint autofix",
      command: "npx",
      args: ["vp", "lint", ...codeFiles, "--max-warnings", "0", "--fix"],
    });
  }
  if (eslintFiles.length > 0) {
    checks.push({
      name: "ESLint autofix",
      command: "npx",
      args: ["eslint", "--fix", "--max-warnings", "0", ...eslintFiles],
    });
  }

  checks.push({
    name: "Knip autofix",
    command: "npx",
    args: ["knip", "--fix", "--fix-type", "dependencies,exports,types,catalog"],
  });

  return checks;
}

export function createLintAnalyses(files: string[]): LintCheck[] {
  const codeFiles = files.filter((file) => CODE_FILE.test(file));
  const eslintFiles = files.filter((file) => ESLINT_FILE.test(file));
  const sourceFiles = files.filter((file) => /^src\/.*\.(?:[cm]?[jt]sx?)$/i.test(file));
  const checks: LintCheck[] = [
    {
      name: "TypeScript typecheck",
      command: "npm",
      args: ["run", "typecheck"],
    },
  ];

  if (codeFiles.length > 0) {
    checks.push({
      name: "Oxlint",
      command: "npx",
      args: ["vp", "lint", ...codeFiles, "--max-warnings", "0"],
    });
  }
  if (eslintFiles.length > 0) {
    checks.push({
      name: "ESLint",
      command: "npx",
      args: ["eslint", "--max-warnings", "0", ...eslintFiles],
    });
  }

  checks.push({
    name: "jscpd",
    command: "npx",
    args: [
      "jscpd",
      "--changed",
      "--baseline",
      join(tmpdir(), `makeamove-jscpd-${process.pid}.json`),
      "--fail-on-new-clones",
    ],
  });

  if (sourceFiles.length > 0) {
    checks.push({
      name: "dependency-cruiser",
      command: "npx",
      args: ["depcruise", "src", "--config", "--affected", "HEAD", ...sourceFiles],
    });
  }

  checks.push({
    name: "React Doctor",
    command: "npx",
    args: [
      "react-doctor",
      "--lint",
      "--scope",
      "changed",
      "--base",
      "HEAD",
      "--include-untracked",
      "--no-supply-chain",
      "--no-score",
      "--yes",
    ],
  });

  return checks;
}

export function runLintChecks(
  checks: LintCheck[],
  run: (check: LintCheck) => LintResult,
  report: (line: string) => void,
): number {
  const failures: { name: string; output: string }[] = [];

  for (const check of checks) {
    report(`Running ${check.name}...`);
    const result = run(check);
    report(`${check.name}: ${result.status === 0 ? "passed" : "failed"}`);
    if (result.status !== 0) {
      failures.push({
        name: check.name,
        output: [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n"),
      });
    }
  }

  for (const failure of failures) {
    report(`${failure.name}: ${failure.output}`);
  }
  report(`${failures.length} failed`);

  return failures.length === 0 ? 0 : 1;
}

function runCommand(check: LintCheck): LintResult {
  const result = spawnSync(check.command, check.args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: [result.stderr, result.error?.message].filter(Boolean).join("\n"),
  };
}

function changedFiles(): string[] {
  const tracked = spawnSync("git", ["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD"], {
    encoding: "utf8",
  });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });

  for (const result of [tracked, untracked]) {
    if (result.status !== 0) {
      throw new Error(result.stderr || "Unable to read changed files from git.");
    }
  }

  return [...new Set(`${tracked.stdout}\n${untracked.stdout}`.split(/\r?\n/))]
    .filter((file) => file && existsSync(resolve(file)))
    .sort();
}

function main(): void {
  const initialFiles = changedFiles();
  if (initialFiles.length === 0) {
    console.log("No changed files to analyze.");
    return;
  }

  console.log(`Checking ${initialFiles.length} changed files.`);
  const fixFailures = runLintChecks(createLintFixes(initialFiles), runCommand, console.log);
  const analysisFiles = changedFiles();
  const analysisFailures = runLintChecks(
    createLintAnalyses(analysisFiles),
    runCommand,
    console.log,
  );

  rmSync(join(tmpdir(), `makeamove-jscpd-${process.pid}.json`), { force: true });
  process.exitCode = fixFailures || analysisFailures ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
