import { describe, expect, it } from "vite-plus/test";
import { ENTRY_ICONS, tokenIconUrl } from "../entryIcons";

describe("library entry icons", () => {
  it("draws a token's icon from the large render of the art it names", () => {
    expect(tokenIconUrl("sword")).toMatch(/\/sword-128\.png$/);
  });

  it("falls back to the bag for an icon it doesn't know", () => {
    expect(tokenIconUrl("no-such-icon")).toBe(tokenIconUrl("bag"));
    expect(tokenIconUrl(undefined)).toBe(tokenIconUrl("bag"));
  });

  it("shares one icon between names for the same thing, so pickers list it once", () => {
    expect(ENTRY_ICONS.fighter).toBe(ENTRY_ICONS.longsword);
    expect(ENTRY_ICONS.ranger).toBe(ENTRY_ICONS.bow);
  });
});
