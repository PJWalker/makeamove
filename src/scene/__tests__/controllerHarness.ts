/*
 * A scene controller over a fake scene, renderer and host, for tests. Test
 * files mock the platform device and media/images before importing this.
 */

import { vi } from "vite-plus/test";
import { LocalDoc } from "../../data/localDoc";
import { SceneController } from "../controller";
import { SceneTools } from "../tools";

type Controller = InstanceType<typeof SceneController>;
type Args = ConstructorParameters<typeof SceneController>;
interface Preview {
  x: number;
  y: number;
  rot: number;
}
export type Fire = (type: string, x: number, y: number, extra?: Record<string, unknown>) => void;

export function setup(els: object[]) {
  const host = Object.assign(new EventTarget(), {
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: () => {},
  });
  const changed: (() => void)[] = [];
  const renderer = {
    camera: { x: 0, y: 0, zoom: 1 },
    previews: new Map<string, Preview>(),
    hidden: new Set<string>(),
    overlayState: {} as { marquee?: unknown; group?: unknown },
    grid: { type: "none", size: 70, offsetX: 0, offsetY: 0 },
    size: { width: 800, height: 600 },
    invalidate: () => {},
    setElements: () => {},
    setCamera: () => {},
    setGrid: () => {},
    setHoverToken: vi.fn(),
    // Ten px a letter, twenty high; bold and italic each widen it, to tell the styles apart.
    measureText: vi.fn((t: { text: string; bold: boolean; italic: boolean }) => ({
      w: t.text.length * 10 + (t.bold ? 5 : 0) + (t.italic ? 3 : 0),
      h: 20,
    })),
  };
  const scene = {
    views: () => els,
    elements: {
      observe: (f: () => void) => {
        changed.push(f);
        return () => {};
      },
    },
    settings: { observe: () => () => {} },
    undo: { on() {}, off() {}, canUndo: () => false, canRedo: () => false },
    grid: () => renderer.grid,
    update: vi.fn<(changes: [string, object][]) => void>(),
    add: vi.fn(),
    remove: vi.fn(),
  };
  const c: Controller = new SceneController(
    scene as unknown as Args[0],
    renderer as unknown as Args[1],
    host as unknown as Args[2],
    "s",
    new SceneTools(LocalDoc.inMemory()),
    () => ({}) as ReturnType<Args[5]>,
  );
  (c as unknown as { restoreCamera: () => void }).restoreCamera = () => {};
  c.start();
  const fire: Fire = (type, x, y, extra = {}) => {
    const e = new Event(type);
    const { timeStamp, ...rest } = extra;
    if (timeStamp !== undefined) Object.defineProperty(e, "timeStamp", { value: timeStamp });
    Object.assign(e, {
      pointerId: 1,
      button: 0,
      clientX: x,
      clientY: y,
      shiftKey: false,
      altKey: false,
      ...rest,
    });
    host.dispatchEvent(e);
  };
  // Tell the controller the scene's elements changed.
  const change = () => {
    for (const f of changed) f();
  };
  return { c, renderer, scene, fire, change };
}

export const token = (id: string, x: number, y: number) => ({
  id,
  type: "token",
  x,
  y,
  w: 40,
  h: 40,
  rot: 0,
  locked: false,
  layer: "token",
  z: "a",
  colour: "#fff",
  name: "",
});
