import { describe, expect, it } from "vitest";
import { md } from "../markdown.macro.ts" with { type: "macro" };

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
