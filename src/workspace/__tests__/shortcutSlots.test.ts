import { describe, expect, it } from "vite-plus/test";

/** The files that offer move and library shortcuts, as text. */
const sources = import.meta.glob<string>(
  [
    "../linkActions.ts",
    "../sheetParts.tsx",
    "../../table/LinkPopups.tsx",
    "../../table/ItemsPanel.tsx",
    "../../table/LibrariesPanel.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
);
const FILE_COUNT = 5;

describe("move and library menu shortcuts", () => {
  it("uses the command slot helpers instead of legacy menu keys", () => {
    expect(Object.keys(sources)).toHaveLength(FILE_COUNT);
    for (const source of Object.values(sources)) {
      const text = source.replaceAll(/campaign\.entityGraphics\.get\(`[^`]+`\)/g, "");
      expect(text).not.toMatch(/(?:move|library):\${[^}]+}/);
    }
  });
});
