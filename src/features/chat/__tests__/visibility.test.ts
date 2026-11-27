import { describe, expect, it } from "vite-plus/test";
import { contentFromText } from "../content";
import { roll } from "../../dice/notation";
import { visibilityOf } from "../types";
import type { ChatMessage, RollVisibility } from "../types";

const base = { id: "m", hlc: "0", author: "pat", name: "Pat" };
const rollBy = (visibility: RollVisibility): ChatMessage => ({
  ...base,
  kind: "roll",
  roll: roll("d6", () => 3),
  visibility,
});
const whisper: ChatMessage = {
  ...base,
  kind: "text",
  text: contentFromText("psst"),
  to: ["kim"],
  toNames: ["Kim"],
};

// Who sees what is proved in audience.ts; this checks messages map onto it.
describe("who sees what", () => {
  it("treats addressed text as a whisper and private rolls as secret", () => {
    expect(visibilityOf(whisper, "kim", false)).toBe("full");
    expect(visibilityOf(whisper, "gm", true)).toBe("hidden");
    expect(visibilityOf(rollBy("private"), "lee", false)).toBe("masked");
    expect(visibilityOf(rollBy("public"), "lee", false)).toBe("full");
  });
});
