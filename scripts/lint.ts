export interface LintCheck {
  name: string;
  script: string;
}

export interface LintResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function runLintChecks(
  checks: LintCheck[],
  run: (script: string) => LintResult,
  report: (line: string) => void,
): number {
  const failures: { name: string; output: string }[] = [];

  for (const check of checks) {
    const result = run(check.script);
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
