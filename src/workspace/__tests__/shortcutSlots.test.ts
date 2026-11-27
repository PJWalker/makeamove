// eslint-disable-next-line import/no-nodejs-modules -- reads source files to check them
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const source = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

describe("move and library menu shortcuts", () => {
  it("uses the command slot helpers instead of legacy menu keys", () => {
    const files = [
      "workspace/linkActions.ts",
      "workspace/sheetParts.tsx",
      "table/LinkPopups.tsx",
      "table/ItemsPanel.tsx",
      "table/LibrariesPanel.tsx",
    ];

    for (const file of files) {
      const text = source(`src/${file}`).replaceAll(
        /campaign\.entityGraphics\.get\(`[^`]+`\)/g,
        "",
      );
      expect(text).not.toMatch(/(?:move|library):\${[^}]+}/);
    }
  });
});
