import { describe, expect, it } from "vitest";

import {
  commandText,
  contentForCommand,
  contentFromText,
  entityContent,
  messageText,
} from "../content";
import { LINK_NODE } from "../../notes/links";
import { TRACKER_NODE } from "../../../core/richText";

describe("chat content", () => {
  it("stores plain text and line breaks as a Tiptap document", () => {
    const content = contentFromText("first\nsecond");
    expect(content.type).toBe("doc");
    expect(messageText(content)).toBe("first\nsecond");
  });

  it("retains formatting and entity links when extracting a command body", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "/me ", marks: [{ type: "bold" }] },
            { type: "text", text: "waves", marks: [{ type: "italic" }] },
            {
              type: LINK_NODE,
              attrs: {
                kind: "character",
                id: "c1",
                label: "Robin",
                text: null,
              },
            },
          ],
        },
      ],
    };

    const body = contentForCommand(content, "waves@[](character:c1)");
    expect((body.content ?? [])[0]!.content).toEqual([
      { type: "text", text: "waves", marks: [{ type: "italic" }] },
      {
        type: LINK_NODE,
        attrs: { kind: "character", id: "c1", label: "Robin", text: null },
      },
    ]);
    expect(commandText(body)).toBe("waves@[](character:c1)");
  });

  it("uses the link label or target name for visible text", () => {
    const linked = entityContent("item", "potion", "Healing draught");
    expect(messageText(linked)).toBe("Healing draught ");
    expect(messageText(entityContent("item", "potion", ""), () => "Potion")).toBe("Potion ");
  });

  it("reads tracker buttons as their token in commands and their label as plain text", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "/me earns " },
            { type: TRACKER_NODE, attrs: { by: 1, name: "XP", label: "+1 XP" } },
          ],
        },
      ],
    };
    expect(commandText(content)).toBe("/me earns [[+1 XP]]");
    expect(messageText(content)).toBe("/me earns +1 XP");
    expect(contentForCommand(content, "earns [[+1 XP]]").content?.[0]?.content?.[1]).toEqual(
      content.content[0]!.content[1],
    );
  });
});
