import { describe, expect, it } from "vite-plus/test";
import {
  backdropColour,
  clampUserColour,
  clampUserOklch,
  contrastingTextColour,
  dominantColour,
  GENERAL_COLOUR_LIMITS,
  gamutMappedOklch,
  gamutMappedUserOklch,
  hexToOklch,
  oklabToHex,
  oklchFromGamutPosition,
  oklchToGamutPosition,
  maxSrgbChroma,
  USER_COLOUR_LIMITS,
  userColourToHex,
  rgbToOklab,
  sceneOklchFromHex,
} from "../colour";

describe("colour", () => {
  it("round-trips sRGB through OKLab", () => {
    for (const hex of ["#000000", "#ffffff", "#2b3a55", "#c08a3e", "#ff0000"]) {
      const n = parseInt(hex.slice(1), 16);
      expect(oklabToHex(rgbToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255))).toBe(hex);
    }
  });
  it("gives white no chroma", () => {
    expect(hexToOklch("#ffffff").c).toBeLessThan(0.001);
    expect(hexToOklch("#ffffff").l).toBeCloseTo(1, 3);
  });
  it("chooses the higher-contrast black or white text colour", () => {
    expect(contrastingTextColour("#000000")).toBe("#ffffff");
    expect(contrastingTextColour("#ffffff")).toBe("#000000");
    expect(contrastingTextColour("#53617a")).toBe("#ffffff");
    expect(contrastingTextColour("#e8c890")).toBe("#000000");
  });
  it("clamps user colour lightness and chroma", () => {
    expect(hexToOklch(clampUserColour("#000000")).l).toBeCloseTo(0.33, 2);
    expect(hexToOklch(clampUserColour("#ffffff")).l).toBeCloseTo(0.95, 2);
    expect(hexToOklch(clampUserColour("#ff0000")).c).toBeCloseTo(0.25, 2);
  });
  it("maps out-of-gamut output without changing internal OKLCH lightness or hue", () => {
    const internal = clampUserOklch({ l: 0.7, c: 0.25, h: 280 });
    const mapped = gamutMappedUserOklch(internal);
    const visible = hexToOklch(userColourToHex(internal));
    expect(internal.c).toBe(0.25);
    expect(mapped.c).toBeLessThan(internal.c);
    expect(mapped.l).toBe(internal.l);
    expect(mapped.h).toBe(internal.h);
    expect(visible.c).toBeLessThan(internal.c);
    expect(visible.l).toBeCloseTo(internal.l, 2);
    expect(visible.h).toBeCloseTo(internal.h, 0);
    expect(clampUserColour(userColourToHex(internal))).toBe(userColourToHex(internal));
  });
  it("keeps blue lightness when rotating its hue to yellow", () => {
    const blue = clampUserOklch(hexToOklch("#0000ff"));
    const yellow = userColourToHex({ ...blue, h: 109.77 });
    const target = 0x5b5a00;
    const actual = Number.parseInt(yellow.slice(1), 16);
    for (const shift of [16, 8, 0])
      expect(Math.abs(((actual >> shift) & 255) - ((target >> shift) & 255))).toBeLessThanOrEqual(
        1,
      );
    expect(hexToOklch(yellow).l).toBeCloseTo(blue.l, 2);
  });
  it("preserves vivid OKLCH chroma in the general picker range", () => {
    const blue = hexToOklch("#0000ff");
    const mappedBlue = gamutMappedOklch(blue, GENERAL_COLOUR_LIMITS);
    const mappedYellow = gamutMappedOklch({ ...blue, h: 109.77 }, GENERAL_COLOUR_LIMITS);
    expect(blue.c).toBeGreaterThan(GENERAL_COLOUR_LIMITS.maxChroma / 2);
    expect(mappedBlue.c).toBeCloseTo(blue.c, 2);
    expect(mappedYellow.l).toBeCloseTo(blue.l, 3);
    expect(mappedYellow.c).toBeLessThan(blue.c);
  });
  it("keeps the full scene OKLCH value", () => {
    const grey = sceneOklchFromHex("#808080");
    expect(grey).toEqual(hexToOklch("#808080"));

    const red = sceneOklchFromHex("#ff0000");
    expect(red).toEqual(hexToOklch("#ff0000"));
  });
  it("fills the gamut rectangle with selectable in-gamut colours", () => {
    for (const range of [GENERAL_COLOUR_LIMITS, USER_COLOUR_LIMITS]) {
      for (const hue of [0, 60, 120, 180, 240, 300]) {
        for (const y of [0, 0.25, 0.5, 0.75, 1]) {
          const edge = oklchFromGamutPosition(1, y, hue, range);
          expect(edge.c).toBe(maxSrgbChroma(edge.l, hue, range.maxChroma));
          for (const x of [0, 0.25, 0.5, 0.75, 1]) {
            const colour = oklchFromGamutPosition(x, y, hue, range);
            expect(gamutMappedOklch(colour, range)).toEqual(colour);
            const position = oklchToGamutPosition(colour, range);
            expect(position.y).toBeCloseTo(y);
            if (edge.c > 0) expect(position.x).toBeCloseTo(x);
          }
        }
      }
    }
  });
  it("has zero chroma at both sRGB lightness endpoints", () => {
    for (const hue of [0, 60, 120, 180, 240, 300]) {
      expect(maxSrgbChroma(0, hue)).toBe(0);
      expect(maxSrgbChroma(1, hue)).toBe(0);
    }
  });
  it("moves the gamut thumb on hue changes without mutating C/L", () => {
    const original = { l: 0.7, c: 0.1, h: 280 };
    const shifted = { ...original, h: 110 };
    expect(oklchToGamutPosition(original).x).not.toBeCloseTo(oklchToGamutPosition(shifted).x);
    expect(oklchToGamutPosition(original).y).toBe(oklchToGamutPosition(shifted).y);
    const vivid = { ...shifted, c: 0.3 };
    expect(oklchToGamutPosition(vivid).x).toBe(1);
    expect(vivid).toEqual({ l: 0.7, c: 0.3, h: 110 });
  });
  it("darkens backdrops but keeps their hue", () => {
    const out = backdropColour("#e8c890");
    expect(hexToOklch(out).l).toBeLessThanOrEqual(0.345);
    expect(Math.abs(hexToOklch(out).h - hexToOklch("#e8c890").h)).toBeLessThan(4);
  });
  it("finds the dominant colourful cluster", () => {
    // 70% parchment, 30% dark grey ink.
    const px: number[] = [];
    for (let i = 0; i < 100; i++) px.push(...(i < 70 ? [232, 200, 144, 255] : [40, 40, 40, 255]));
    expect(dominantColour(new Uint8ClampedArray(px))).toBe("#e8c890");
  });
});
