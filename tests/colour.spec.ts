/// <reference types="vite-plus/test/browser-playwright" />
import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vite-plus/test";
import { cdp, page, userEvent } from "vite-plus/test/browser/context";
import { ColourPicker } from "../src/ui/ColourPicker";
import {
  gamutMappedOklch,
  hexToOklch,
  oklchToGamutHex,
  oklchFromGamutPosition,
} from "../src/lib/colour";
import "../src/styles/base.css";
import "../src/styles/tokens.css";
import "../src/styles/components.css";
import "../src/styles/transitions.css";

function mount(value: string, constrainUserColour = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const seen = { value };
  function Picker() {
    const [colour, setColour] = useState(value);
    return createElement(ColourPicker, {
      label: "Test colour",
      value: colour,
      alpha: true,
      constrainUserColour,
      onChange: (next: string) => {
        seen.value = next;
        setColour(next);
      },
    });
  }
  root.render(createElement(Picker));
  return {
    seen,
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}

test("the hue rainbow reflects C/L with readable bounds without changing the selection", async () => {
  for (const hex of ["#4488cc", "#333333", "#000000", "#ffffff"]) {
    const { seen, unmount } = mount(`${hex}ff`);
    try {
      await page.getByRole("button", { name: "Test colour" }).click();
      const colour = hexToOklch(hex);
      const lightness = Math.max(0.2, Math.min(0.9, colour.l));
      const chroma = Math.max(0.04, colour.c);
      const stops = [0, 60, 120, 180, 240, 300, 360].map((hue) => {
        const mapped = gamutMappedOklch({ l: lightness, c: chroma, h: hue });
        return `oklch(${(mapped.l * 100).toFixed(2)}% ${mapped.c.toFixed(4)} ${hue})`;
      });
      const expected = document.createElement("div");
      expected.style.background = `linear-gradient(90deg in oklch, ${stops.join(", ")})`;
      const track = document.querySelector<HTMLElement>(
        ".colour-picker-slider:not(.colour-picker-alpha) .colour-picker-track",
      )!;
      expect(track.style.background).toBe(expected.style.background);
      expect(seen.value).toBe(`${hex}ff`);
      if (hex === "#4488cc") {
        const spectrum = track.style.background;
        page.getByRole("slider", { name: "Hue", exact: true }).element().focus();
        await userEvent.keyboard("{ArrowRight}");
        expect(track.style.background).toBe(spectrum);
        const field = page.getByRole("textbox", { name: "Hex" });
        await field.fill("#cc4488");
        await userEvent.keyboard("{Enter}");
        expect(seen.value).toBe("#cc4488ff");
        expect(track.style.background).not.toBe(spectrum);
      }
      await userEvent.keyboard("{Escape}");
    } finally {
      unmount();
    }
  }
});

test("hue and opacity preserve C/L through clamped output and parent echoes", async () => {
  const { seen, unmount } = mount("#0000ff80");
  try {
    await page.getByRole("button", { name: "Test colour" }).click();
    const hue = page.getByRole("slider", { name: "Hue", exact: true });
    const original = hexToOklch("#0000ff");
    const areaThumb = () =>
      document.querySelector<HTMLElement>(".colour-picker-area .colour-picker-thumb")!;
    const originalTop = areaThumb().style.top;
    hue.element().focus();
    await userEvent.keyboard("{Home}{ArrowRight>110}");
    expect(seen.value).toBe(`${oklchToGamutHex({ ...original, h: 110 })}80`);
    expect(areaThumb().style.top).toBe(originalTop);
    expect(areaThumb().style.left).toBe("100%");

    const opacity = page.getByRole("slider", { name: "Opacity", exact: true });
    opacity.element().focus();
    await userEvent.keyboard("{Home}{ArrowRight>25}");
    expect(seen.value.endsWith("40")).toBe(true);

    hue.element().focus();
    await userEvent.keyboard("{Home}{ArrowRight>264}");
    expect(seen.value).toBe(`${oklchToGamutHex({ ...original, h: 264 })}40`);
    expect(hexToOklch(seen.value.slice(0, 7)).c).toBeGreaterThan(0.25);
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("button", { name: "Test colour" })).toHaveFocus();
  } finally {
    unmount();
  }
});

test("dragging to the white and black corners preserves the thumb position", async () => {
  const { seen, unmount } = mount("#4488ccff");
  try {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await page.getByRole("button", { name: "Test colour" }).click();
    const area = document.querySelector<HTMLElement>(".colour-picker-area")!;
    const thumb = document.querySelector<HTMLElement>(".colour-picker-area .colour-picker-thumb")!;
    const bounds = area.getBoundingClientRect();
    const frame = window.frameElement!.getBoundingClientRect();
    const point = (x: number, y: number) => ({
      x: frame.left + ((bounds.left + x * bounds.width) * frame.width) / innerWidth,
      y: frame.top + ((bounds.top + y * bounds.height) * frame.height) / innerHeight,
    });
    const mouse = async (
      type: "mouseMoved" | "mousePressed" | "mouseReleased",
      x: number,
      y: number,
      buttons: number,
    ) =>
      cdp().send("Input.dispatchMouseEvent", {
        type,
        ...point(x, y),
        button: "left",
        buttons,
        clickCount: 1,
      });
    await mouse("mouseMoved", 0.7, 0.5, 0);
    await mouse("mousePressed", 0.7, 0.5, 1);
    await mouse("mouseMoved", 1.05, -0.05, 1);
    await expect.poll(() => thumb.style.top).toBe("0%");
    expect(thumb.style.left).toBe("100%");
    expect(seen.value).toBe("#ffffffff");
    await mouse("mouseMoved", 1.05, 1.05, 1);
    await expect.poll(() => thumb.style.top).toBe("100%");
    expect(thumb.style.left).toBe("100%");
    expect(seen.value).toBe("#000000ff");
    await mouse("mouseMoved", 1.05, 0.5, 1);
    await expect.poll(() => thumb.style.left).toBe("100%");
    await mouse("mouseReleased", 1.05, 0.5, 0);
  } finally {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    unmount();
  }
});

test("the rectangle is fully painted and surface selection stays in gamut", async () => {
  const { seen, unmount } = mount("#4488ccff");
  try {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await page.getByRole("button", { name: "Test colour" }).click();
    const canvas = document.querySelector<HTMLCanvasElement>(".colour-picker-gamut-canvas")!;
    await expect.poll(() => canvas.width).toBe(192);
    await expect.poll(() => canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data[3]).toBe(255);
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, 192, 192).data;
    for (let offset = 3; offset < pixels.length; offset += 4) expect(pixels[offset]).toBe(255);
    const row = 96;
    const colours = new Set<number>();
    for (let x = 0; x < 192; x++) {
      const offset = (row * 192 + x) * 4;
      colours.add((pixels[offset]! << 16) | (pixels[offset + 1]! << 8) | pixels[offset + 2]!);
    }
    expect(colours.size).toBeGreaterThan(120);
    const hue = hexToOklch("#4488cc").h;
    const area = document.querySelector<HTMLElement>(".colour-picker-area")!;
    const bounds = area.getBoundingClientRect();
    await page
      .elementLocator(area)
      .click({ position: { x: bounds.width * 0.99, y: bounds.height * 0.5 } });
    const picked = hexToOklch(seen.value.slice(0, 7));
    const expected = oklchFromGamutPosition(0.99, 0.5, hue);
    expect(picked.l).toBeCloseTo(expected.l, 2);
    expect(picked.c).toBeCloseTo(expected.c, 2);
    await page.screenshot({ path: ".vitest/attachments/colour-picker.png" });
  } finally {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    unmount();
  }
});
