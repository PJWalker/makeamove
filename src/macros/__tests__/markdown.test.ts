import { describe, expect, it } from "vite-plus/test";
import { macroPlugins } from "../../../vite.config";
import { md } from "../markdown.macro.ts" with { type: "macro" };

describe("macro dependency scanning", () => {
  const source = "../../macros/markdown.macro";
  const importer = "/src/systems/dungeon-world/index.ts";

  function resolveMacro(scan: boolean): unknown {
    const guard = macroPlugins().find((plugin) => plugin.name === "macros-only-at-build-time")!;
    const hook = guard.resolveId!;
    const resolveId = typeof hook === "function" ? hook : hook.handler;
    return Reflect.apply(
      resolveId,
      {
        error(message: string) {
          throw new Error(message);
        },
      },
      [source, importer, { scan }],
    );
  }

  it("excludes build-time macros from dependency scanning", () => {
    expect(resolveMacro(true)).toEqual({ id: source, external: true });
  });

  it("still rejects runtime macro imports outside dependency scanning", () => {
    expect(() => resolveMacro(false)).toThrow("is a build-time macro");
  });
});

describe("md macro", () => {
  it("inlines markdown as rich text at build time", () => {
    expect(md("When you **hack**, roll+STR.\nOn a 10+ [[+1 XP]]\n\n- one\n- *two*")).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "When you " },
            { type: "text", text: "hack", marks: [{ type: "bold" }] },
            { type: "text", text: ", roll+STR." },
            { type: "hardBreak" },
            { type: "text", text: "On a 10+ " },
            { type: "trackerButton", attrs: { by: 1, name: "XP", label: "+1 XP" } },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "two", marks: [{ type: "italic" }] }],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
