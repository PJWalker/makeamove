import { describe, expect, it, vi } from "vite-plus/test";
import { clipboardHtml, elementsFromClipboard } from "../clipboard";
import type { SceneElement } from "../types";

const text: SceneElement = {
  id: "t",
  type: "text",
  layer: "over",
  z: "a3",
  x: 10,
  y: 20,
  w: 100,
  h: 30,
  rot: 0,
  locked: true,
  createdBy: "gm",
  text: 'Say "hi" & <go>',
  colour: "#ffffff",
  size: 24,
  bw: 100,
  bh: 30,
  font: "serif",
  bold: false,
  italic: true,
};

describe("scene elements on the clipboard", () => {
  it("come back as they were copied, without what the scene gave them", () => {
    const [copy] = elementsFromClipboard(clipboardHtml([text])) ?? [];
    const { id: _id, z: _z, createdBy: _by, ...rest } = text;
    expect(copy).toEqual(rest);
  });

  it("keep their order, bottom to top", () => {
    const copies = elementsFromClipboard(
      clipboardHtml([
        text,
        { ...text, id: "u", text: "second" },
        { ...text, id: "v", text: "third" },
      ]),
    );
    expect(copies?.map((c) => c.type === "text" && c.text)).toEqual([text.text, "second", "third"]);
  });

  it("leave out what the scene couldn't use, and keep the rest", () => {
    vi.spyOn(console, "warn").mockReturnValue();
    const cornerless: SceneElement = {
      ...text,
      type: "shape",
      shape: "polygon",
      points: [],
      stroke: "#ffffffff",
      fill: "#ffffff00",
      width: 2,
    };
    expect(elementsFromClipboard(clipboardHtml([cornerless, text]))).toHaveLength(1);
  });

  it("aren't found in other HTML", () => {
    expect(elementsFromClipboard("<p>Some text</p>")).toBeNull();
  });
});
