import { describe, expect, it } from "vite-plus/test";
import { HOLE, titleCase } from "../titleCase.ts";

describe("titleCase", () => {
  it.each([
    ["Delete character", "Delete Character"],
    ["delete from this device", "Delete from This Device"],
    ["Back To The Lobby", "Back to the Lobby"],
    ["Join A Campaign", "Join a Campaign"],
    ["Save as", "Save As"],
    ["Level up...", "Level Up…"],
    ["Close window", "Close Window"],
    ["Rename: the new name", "Rename: The New Name"],
  ])("writes %j as %j", (from, to) => {
    expect(titleCase(from)).toBe(to);
  });

  it.each([
    "Remove from Hotbar",
    "Set Up Scene",
    "Set up Scene",
    "Roll 2d6",
    "Add HP",
    "Open in iPad",
    "Go to Scene",
    "Delete Character…",
    "(Optional) Notes",
  ])("leaves %j as it is", (text) => {
    expect(titleCase(text)).toBe(text);
  });

  it("leaves interpolated values, and what touches them, as they are", () => {
    expect(titleCase(`Delete ${HOLE}`)).toBe(`Delete ${HOLE}`);
    expect(titleCase(`move ${HOLE} to the front`)).toBe(`Move ${HOLE} to the Front`);
    expect(titleCase(`${HOLE}'s sheet`)).toBe(`${HOLE}'s Sheet`);
  });

  it("keeps whitespace as written", () => {
    expect(titleCase("  add  item ")).toBe("  Add  Item ");
  });
});
