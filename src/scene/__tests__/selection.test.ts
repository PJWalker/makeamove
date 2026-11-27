import { describe, expect, it, vi } from "vite-plus/test";
import { setup, token } from "./controllerHarness";
import type { Fire } from "./controllerHarness";

const handles = vi.hoisted(() => ({ knob: { x: -999, y: -999 } }));
vi.mock("../render/handles", () => ({
  HANDLE_SIZE: 10,
  rotateHandlePosition: () => handles.knob,
  lightHandles: () => [],
}));
vi.mock("../../platform/device", () => ({ device: { value: { id: "x" } } }));
vi.mock("../../media/images", () => ({
  importImage: vi.fn(),
  imageColour: vi.fn(() => Promise.resolve(null)),
}));

describe("SceneController", () => {
  describe("double-clicking text", () => {
    const words = {
      ...token("words", 100, 100),
      type: "text",
      layer: "over",
      w: 120,
      h: 30,
      text: "Ford the river here",
    };
    // A pointer event's `detail` is always 0, so the controller counts clicks itself.
    const click = (fire: Fire, x: number, y: number, timeStamp: number) => {
      fire("pointerdown", x, y, { detail: 0, timeStamp });
      fire("pointerup", x, y, { detail: 0, timeStamp });
    };

    it("asks to edit it", () => {
      const { c, fire } = setup([words]);
      c.onTextRequest = vi.fn();
      click(fire, 140, 110, 1000);
      expect(c.onTextRequest).not.toHaveBeenCalled();
      click(fire, 141, 111, 1200);
      expect(c.onTextRequest).toHaveBeenCalledWith({ at: { x: 100, y: 100 }, id: "words" });
    });

    it("needs both clicks close together in time", () => {
      const { c, fire } = setup([words]);
      c.onTextRequest = vi.fn();
      click(fire, 140, 110, 1000);
      click(fire, 140, 110, 2000);
      expect(c.onTextRequest).not.toHaveBeenCalled();
    });

    it("needs both clicks in the same place", () => {
      const { c, fire } = setup([{ ...words, w: 400 }]);
      c.onTextRequest = vi.fn();
      click(fire, 140, 110, 1000);
      click(fire, 240, 110, 1100);
      expect(c.onTextRequest).not.toHaveBeenCalled();
    });
  });

  describe("the Text tool", () => {
    const words = {
      ...token("words", 100, 100),
      type: "text",
      layer: "over",
      w: 120,
      h: 30,
      bw: 60,
      bh: 15,
      size: 12,
      text: "Ford",
      font: "sans",
      bold: true,
      italic: false,
    };

    it("asks for new text where it's pressed", () => {
      const { c, fire } = setup([]);
      c.tools.activeTool.set("text");
      c.onTextRequest = vi.fn();
      fire("pointerdown", 300, 300);
      expect(c.onTextRequest).toHaveBeenCalledWith({ at: { x: 300, y: 300 } });
    });

    it("edits text it's pressed on", () => {
      const { c, fire } = setup([words]);
      c.tools.activeTool.set("text");
      c.onTextRequest = vi.fn();
      fire("pointerdown", 110, 105);
      expect(c.onTextRequest).toHaveBeenCalledWith({ at: { x: 100, y: 100 }, id: "words" });
    });

    it("puts new text in the tool's font and style", () => {
      const { c, scene } = setup([]);
      c.tools.setTextStyle({ font: "serif", bold: false, italic: true });
      c.putText({ x: 5, y: 6 }, " Here ");
      expect(scene.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "text",
          text: "Here",
          font: "serif",
          bold: false,
          italic: true,
          x: 5,
          y: 6,
          bw: 43,
          bh: 20,
        }),
      );
    });

    it("resizes text to fit as its style changes, keeping its scale", () => {
      const { c, scene } = setup([words]);
      c.setProps(["words"], { italic: true });
      expect(scene.update).toHaveBeenCalledWith([
        ["words", { italic: true, bw: 48, bh: 20, w: 96, h: 40 }],
      ]);
    });

    it("resizes text to fit as it changes", () => {
      const { c, scene } = setup([words]);
      c.putText({ x: 0, y: 0 }, "Ford here", "words");
      expect(scene.update).toHaveBeenCalledWith([
        ["words", { text: "Ford here", bw: 95, bh: 20, w: 190, h: 40 }],
      ]);
    });

    it("removes text emptied of words", () => {
      const { c, scene } = setup([words]);
      c.putText({ x: 0, y: 0 }, "  ", "words");
      expect(scene.remove).toHaveBeenCalledWith(["words"]);
    });
  });

  it("opens token details on click release, never while dragging", () => {
    const source = { ...token("character", 100, 100), characterId: "hero" };
    const { c, fire } = setup([source]);
    c.onTokenClick = vi.fn();
    fire("pointerdown", 100, 100);
    expect(c.onTokenClick).not.toHaveBeenCalled();
    fire("pointerup", 100, 100);
    expect(c.onTokenClick).toHaveBeenCalledWith(source);
    vi.mocked(c.onTokenClick).mockClear();
    fire("pointerdown", 100, 100);
    fire("pointermove", 200, 200);
    fire("pointerup", 200, 200);
    expect(c.onTokenClick).not.toHaveBeenCalled();
  });

  it("forwards non-item token drags and leaves canvas movement to the controller", () => {
    const source = { ...token("character", 100, 100), characterId: "hero" };
    const { c, scene, fire } = setup([source]);
    c.onTokenDragMove = vi.fn();
    c.onTokenDrop = vi.fn(() => false);
    fire("pointerdown", 100, 100);
    fire("pointermove", 102, 100);
    expect(c.onTokenDragMove).not.toHaveBeenCalled();
    fire("pointermove", 200, 200, { metaKey: true });
    expect(c.onTokenDragMove).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ metaKey: true }),
    );
    fire("pointerup", 200, 200, { metaKey: true });
    expect(c.onTokenDrop).toHaveBeenCalledWith(source, expect.objectContaining({ metaKey: true }));
    expect(scene.update).toHaveBeenCalledWith([
      ["character", expect.objectContaining({ x: 200, y: 200 })],
    ]);
    expect(c.onTokenDragMove).toHaveBeenLastCalledWith(null, expect.any(Event));
  });

  it.each(["pointercancel", "escape"])("restores token previews on %s", (cancel) => {
    const { c, renderer, scene, fire } = setup([token("source", 100, 100)]);
    c.onTokenDragMove = vi.fn();
    c.onTokenDrop = vi.fn(() => true);
    fire("pointerdown", 100, 100);
    fire("pointermove", 200, 200);
    expect(renderer.previews.size).toBe(1);
    if (cancel === "pointercancel") fire("pointercancel", 200, 200);
    else c.cancelGesture();
    expect(renderer.previews.size).toBe(0);
    expect(scene.update).not.toHaveBeenCalled();
    expect(c.onTokenDrop).not.toHaveBeenCalled();
    expect(c.onTokenDragMove).toHaveBeenLastCalledWith(null);
  });

  it("does not commit canvas positions after a handled external drop", () => {
    const { c, renderer, scene, fire } = setup([token("source", 100, 100)]);
    c.onTokenDrop = vi.fn(() => {
      renderer.previews.clear();
      return true;
    });
    fire("pointerdown", 100, 100);
    fire("pointermove", 200, 200);
    fire("pointerup", 200, 200);
    expect(c.onTokenDrop).toHaveBeenCalledOnce();
    expect(scene.update).not.toHaveBeenCalled();
  });

  it("keeps multi-token movements inside the normal canvas gesture path", () => {
    const { c, scene, fire } = setup([token("first", 100, 100), token("second", 200, 100)]);
    c.selection.value = ["first", "second"];
    c.onTokenDragMove = vi.fn();
    c.onTokenDrop = vi.fn(() => true);
    fire("pointerdown", 100, 100);
    fire("pointermove", 300, 300);
    fire("pointerup", 300, 300);
    expect(c.onTokenDragMove).not.toHaveBeenCalled();
    expect(c.onTokenDrop).not.toHaveBeenCalled();
    expect(scene.update.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("does not drag locked tokens to external targets", () => {
    const locked = { ...token("locked", 100, 100), locked: true };
    const { c, scene, fire } = setup([locked]);
    c.onTokenDragMove = vi.fn();
    c.onTokenDrop = vi.fn(() => true);
    fire("pointerdown", 100, 100);
    fire("pointermove", 300, 300);
    fire("pointerup", 300, 300);
    expect(c.onTokenDragMove).not.toHaveBeenCalled();
    expect(c.onTokenDrop).not.toHaveBeenCalled();
    expect(scene.update).not.toHaveBeenCalled();
  });

  it("forwards screen hover positions after panning and zooming and clears them on leave", () => {
    const { renderer, fire } = setup([token("a", 100, 100)]);
    renderer.camera = { x: 200, y: 120, zoom: 2 };
    fire("pointermove", 400, 320);
    expect(renderer.setHoverToken).toHaveBeenLastCalledWith("a", {
      x: 400,
      y: 320,
    });
    fire("pointermove", 100, 60);
    expect(renderer.setHoverToken).toHaveBeenLastCalledWith(null, {
      x: 100,
      y: 60,
    });
    fire("pointerleave", 100, 60);
    expect(renderer.setHoverToken).toHaveBeenLastCalledWith(null);
  });

  it("marquee selects elements inside a dragged rectangle", () => {
    const { c, renderer, fire } = setup([
      token("a", 100, 100),
      token("b", 130, 120),
      token("far", 500, 500),
    ]);
    fire("pointerdown", 50, 50);
    fire("pointermove", 100, 100);
    fire("pointermove", 200, 200);
    expect(renderer.overlayState.marquee).toEqual({
      x: 50,
      y: 50,
      w: 150,
      h: 150,
    });
    fire("pointerup", 200, 200);
    expect(c.selection.value.sort()).toEqual(["a", "b"]);
  });

  it("rotates a multi-selection around its centre", () => {
    const { c, renderer, scene, fire } = setup([token("a", 100, 100), token("b", 200, 100)]);
    c.selection.value = ["a", "b"];
    const frame = renderer.overlayState.group;
    expect(frame).toMatchObject({ x: 150, y: 100 });
    // Pretend the knob sits at the frame's right edge, then turn it 90° clockwise.
    renderer.overlayState.group = frame;
    handles.knob = { x: 250, y: 100 };
    fire("pointerdown", 250, 100);
    handles.knob = { x: -999, y: -999 };
    fire("pointermove", 150, 200);
    const a = renderer.previews.get("a")!;
    expect(a.x).toBeCloseTo(150);
    expect(a.y).toBeCloseTo(50);
    expect(a.rot).toBeCloseTo(Math.PI / 2);
    fire("pointerup", 150, 200);
    expect(scene.update).toHaveBeenCalledTimes(1);
    expect(scene.update.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("removes only unlocked elements and clears them from selection", () => {
    const locked = token("locked", 100, 100);
    locked.locked = true;
    const { c, scene } = setup([token("open", 50, 50), locked]);
    c.selection.value = ["open", "locked"];

    c.remove(["open", "locked"]);

    expect(scene.remove).toHaveBeenCalledWith(["open"]);
    expect(c.selection.value).toEqual(["locked"]);
  });
});
