import { describe, expect, it, vi } from 'vitest'

vi.mock('../renderer', () => ({
  HANDLE_SIZE: 10,
  rotateHandlePosition: () => ({ x: -999, y: -999 }),
}))
vi.mock('../../platform/device', () => ({ device: { value: { id: 'x' } } }))
vi.mock('../images', () => ({ importImage: vi.fn(), imageColour: vi.fn() }))

const { SceneController } = await import('../controller')

function setup(els: any[]) {
  const host: any = new EventTarget()
  host.style = {}
  host.getBoundingClientRect = () => ({ left: 0, top: 0 })
  host.setPointerCapture = () => {}
  const renderer: any = {
    camera: { x: 0, y: 0, zoom: 1 },
    previews: new Map(),
    hidden: new Set(),
    overlayState: {},
    grid: { type: "none", size: 70, offsetX: 0, offsetY: 0 },
    size: { width: 800, height: 600 },
    invalidate: () => {},
    setElements: () => {},
    setCamera: () => {},
    setGrid: () => {},
    setHoverToken: vi.fn(),
  };
  const scene: any = {
    views: () => els,
    elements: { observeDeep() {}, unobserveDeep() {} },
    settings: { observe() {}, unobserve() {} },
    undo: { on() {}, off() {}, canUndo: () => false, canRedo: () => false },
    grid: () => renderer.grid,
    update: vi.fn(),
    remove: vi.fn(),
  };
  const c = new SceneController(scene, renderer, host, 's', () => ({}) as any)
  ;(c as any).restoreCamera = () => {}
  c.start()
  const fire = (type: string, x: number, y: number, extra = {}) => {
    const e: any = new Event(type)
    Object.assign(e, { pointerId: 1, button: 0, clientX: x, clientY: y, shiftKey: false, altKey: false, ...extra })
    host.dispatchEvent(e)
  }
  return { c, renderer, scene, fire }
}

const token = (id: string, x: number, y: number) => ({ id, type: 'token', x, y, w: 40, h: 40, rot: 0, locked: false, layer: 'token', z: 'a', colour: '#fff', name: '' })

describe("SceneController", () => {
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
    expect(c.onTokenDrop).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ metaKey: true }),
    );
    expect(scene.update).toHaveBeenCalledWith([
      ["character", expect.objectContaining({ x: 200, y: 200 })],
    ]);
    expect(c.onTokenDragMove).toHaveBeenLastCalledWith(null, expect.any(Event));
  });

  it.each(["pointercancel", "escape"])(
    "restores token previews on %s",
    (cancel) => {
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
    },
  );

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
    const { c, scene, fire } = setup([
      token("first", 100, 100),
      token("second", 200, 100),
    ]);
    c.selection.value = ["first", "second"];
    c.onTokenDragMove = vi.fn();
    c.onTokenDrop = vi.fn(() => true);
    fire("pointerdown", 100, 100);
    fire("pointermove", 300, 300);
    fire("pointerup", 300, 300);
    expect(c.onTokenDragMove).not.toHaveBeenCalled();
    expect(c.onTokenDrop).not.toHaveBeenCalled();
    expect(scene.update.mock.calls[0][0]).toHaveLength(2);
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
    const { c, renderer, scene, fire } = setup([
      token("a", 100, 100),
      token("b", 200, 100),
    ]);
    c.selection.value = ["a", "b"];
    (c as any).updateOverlay();
    const frame = renderer.overlayState.group;
    expect(frame).toMatchObject({ x: 150, y: 100 });
    // Pretend the knob sits at the frame's right edge, then turn it 90° clockwise.
    renderer.overlayState.group = frame;
    (c as any).handleAt = () => ({ kind: "rotate" });
    fire("pointerdown", 250, 100);
    fire("pointermove", 150, 200);
    const a = renderer.previews.get("a");
    expect(a.x).toBeCloseTo(150);
    expect(a.y).toBeCloseTo(50);
    expect(a.rot).toBeCloseTo(Math.PI / 2);
    fire("pointerup", 150, 200);
    expect(scene.update).toHaveBeenCalledTimes(1);
    expect(scene.update.mock.calls[0][0]).toHaveLength(2);
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
