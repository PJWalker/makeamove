import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import { isNothing, isNumber, objectOf } from "../../data/guards";
import { undoStack } from "../../data/undo";
import { callKey, CommandRegistry, GM_ONLY, type Command, type CommandHost } from "../commands";
import { UndoHistory } from "../undo";

/** A host over one plain document, with a role that tests can change. */
function host(gm = false) {
  const doc = new Y.Doc();
  const map = doc.getMap<number>("m");
  const origin = {};
  const h: CommandHost & { gm: boolean } = {
    gm,
    isGm() {
      return this.gm;
    },
    transact: (fn, undoable) => doc.transact(fn, undoable ? origin : null),
    history: new UndoHistory(),
    undoStack: undoStack(doc, origin, 60_000),
  };
  h.history.track(h.undoStack);
  return { h, map, registry: new CommandRegistry(h) };
}

type Ctx = ReturnType<typeof host>["h"];
const setTo = (
  map: Y.Map<number>,
  extra: Partial<Command<Ctx, { n: number }>> = {},
): Command<Ctx, { n: number }> => ({
  id: "test.set",
  params: objectOf({ n: isNumber }),
  run: (_, { n }) => map.set("n", n),
  ...extra,
});

describe("CommandRegistry", () => {
  it("runs a permitted, available call and returns what it returns", () => {
    const { registry } = host();
    const c: Command<Ctx, void, number> = { id: "t.answer", params: isNothing, run: () => 42 };
    expect(registry.execute(c, undefined)).toBe(42);
  });

  it("refuses GM commands to players, then availability, without running", () => {
    const { h, map, registry } = host();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const gmOnly = setTo(map, { permission: "gm" });
    expect(registry.check(gmOnly, { n: 1 })).toBe(GM_ONLY);
    registry.execute(gmOnly, { n: 1 });
    expect(map.get("n")).toBeUndefined();
    h.gm = true;
    const unavailable = setTo(map, { permission: "gm", available: () => "Not now" });
    expect(registry.check(unavailable, { n: 1 })).toBe("Not now");
    expect(registry.permits(unavailable, { n: 1 })).toBe(true);
    warn.mockRestore();
  });

  it("makes each call one undo step, and calls in one group one step", () => {
    const { h, map, registry } = host();
    const set = setTo(map);
    registry.execute(set, { n: 1 });
    registry.execute(set, { n: 2 });
    h.history.undo();
    expect(map.get("n")).toBe(1);

    const typed = setTo(map, { undoGroup: "typing" });
    registry.execute(typed, { n: 3 });
    registry.execute(typed, { n: 4 });
    h.history.undo();
    expect(map.get("n")).toBe(1);
  });

  it("keeps calls that opt out of undo out of the history", () => {
    const { h, map, registry } = host();
    registry.execute(setTo(map, { undoGroup: false }), { n: 5 });
    expect(h.history.canUndo.value).toBe(false);
    expect(map.get("n")).toBe(5);
  });

  it("runs several calls as one step", () => {
    const { h, map, registry } = host();
    const set = setTo(map);
    registry.execute(set, { n: 1 });
    registry.batch(() => {
      registry.execute(set, { n: 2 });
      registry.execute(set, { n: 3 });
    });
    h.history.undo();
    expect(map.get("n")).toBe(1);
  });

  it("runs a stand-in under the same id, and lists it in the original's place", () => {
    const { map, registry } = host();
    const original = setTo(map);
    const standIn = setTo(map, { replaces: true, run: (_, { n }) => map.set("n", n * 10) });
    registry.register([original, standIn]);
    registry.execute(original, { n: 2 });
    expect(map.get("n")).toBe(20);
    expect(registry.all()).toEqual([standIn]);
  });

  it("resolves stored calls by key, and leaves out ones that no longer fit", () => {
    const { map, registry } = host();
    const set = setTo(map);
    registry.register([set]);
    expect(registry.resolve(callKey(set.id, { n: 3 }))).toEqual({ command: set, params: { n: 3 } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(registry.resolve(callKey(set.id, { n: "three" }))).toBeNull();
    expect(registry.resolve("test.gone")).toBeNull();
    warn.mockRestore();
  });
});

describe("UndoHistory", () => {
  it("undoes the latest step across documents, and a new step drops every redo", () => {
    const history = new UndoHistory();
    const [a, b] = [new Y.Doc(), new Y.Doc()];
    const origin = {};
    const [ua, ub] = [undoStack(a, origin), undoStack(b, origin)];
    history.track(ua);
    history.track(ub);
    a.transact(() => a.getMap("m").set("x", 1), origin);
    b.transact(() => b.getMap("m").set("y", 1), origin);
    history.undo();
    expect(b.getMap("m").get("y")).toBeUndefined();
    expect(a.getMap("m").get("x")).toBe(1);
    history.undo();
    expect(a.getMap("m").get("x")).toBeUndefined();
    history.redo();
    expect(a.getMap("m").get("x")).toBe(1);
    expect(history.canRedo.value).toBe(true);
    a.transact(() => a.getMap("m").set("z", 1), origin);
    expect(history.canRedo.value).toBe(false);
  });
});
