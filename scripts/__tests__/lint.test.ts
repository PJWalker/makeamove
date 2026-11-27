import { describe, expect, it } from "vite-plus/test";
import { runLintChecks } from "../lint";

describe("changed-code lint checks", () => {
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
