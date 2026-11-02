import { afterEach, describe, expect, it, vi } from "vitest";
import type { TokenElement } from "../../scene/types";
import type { Campaign } from "../../store/campaign";

vi.mock("../../characters/api", () => ({
  addItem: vi.fn(),
  canEdit: vi.fn(() => true),
  getCharacter: () => ({ name: "Character" }),
  selectedCharacterId: () => "character",
  setLearned: vi.fn(),
  systemOf: () => ({ items: [{ id: "item", name: "Sword" }] }),
}));
vi.mock("../../characters/hotbar", () => ({
  editHotbar: vi.fn(),
  insertAt: vi.fn(),
}));
vi.mock("../../notes/targets", () => ({
  linkLabel: (_campaign: unknown, _kind: string, id: string) =>
    id === "missing" ? null : id,
}));
vi.mock("../entityGraphics", () => ({
  getEntityGraphic: () => ({ kind: "icon", name: "sword" }),
}));
vi.mock("../canvasState", () => ({
  flashSceneDrop: vi.fn(),
  sceneCharacterAt: { value: null },
  sceneDropHighlight: { value: null },
  tokenDrop: { value: null },
}));
vi.mock("../../ui/Tooltip", () => ({ hideTooltip: vi.fn() }));

const { dropOn, registerEntityDrop, registerLinkDrop, tokenEntity } =
  await import("../entityDrag");
const campaign = {} as Campaign;
const token = (patch: Partial<TokenElement> = {}): TokenElement => ({
  id: "token",
  type: "token",
  x: 100,
  y: 100,
  w: 40,
  h: 40,
  rot: 0,
  locked: false,
  layer: "token",
  z: "a",
  createdBy: "me",
  name: "Scene name",
  colour: "#fff",
  style: "disc",
  ...patch,
});

describe("dropOn", () => {
  const receiver = (dataset: Record<string, string> = {}, canvas = false) =>
    ({
      dataset,
      isConnected: true,
      matches: () => canvas,
      hasAttribute: (name: string) =>
        name === "data-folder-drop" && "folderDrop" in dataset,
    }) as unknown as HTMLElement;

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("reports accepted receivers and flashes only accepted drops", () => {
    vi.useFakeTimers();
    const element = receiver();
    const drop = vi.fn();
    const unregister = registerEntityDrop(element, () => true, drop);
    expect(dropOn({ element }, { label: "Entity" }, 0, 0)).toBe(true);
    expect(drop).toHaveBeenCalledOnce();
    expect(element.dataset.dropped).toBe("true");
    vi.runAllTimers();
    expect(element.dataset.dropped).toBeUndefined();
    unregister();
  });

  it("rejects a target that no longer accepts the entity or explicitly rejects the operation", () => {
    const element = receiver();
    const drop = vi.fn(() => false);
    let accepts = true;
    const unregister = registerEntityDrop(element, () => accepts, drop);
    expect(dropOn({ element }, { label: "Entity" }, 0, 0)).toBe(false);
    expect(element.dataset.dropped).toBeUndefined();
    accepts = false;
    expect(dropOn({ element }, { label: "Entity" }, 0, 0)).toBe(false);
    expect(drop).toHaveBeenCalledOnce();
    unregister();
  });

  it("rejects detached or unregistered targets", () => {
    const element = receiver();
    const drop = vi.fn();
    const unregister = registerEntityDrop(element, () => true, drop);
    Object.defineProperty(element, "isConnected", {
      value: false,
      configurable: true,
    });
    expect(dropOn({ element }, { label: "Entity" }, 0, 0)).toBe(false);
    Object.defineProperty(element, "isConnected", { value: true });
    unregister();
    expect(dropOn({ element }, { label: "Entity" }, 0, 0)).toBe(false);
    expect(drop).not.toHaveBeenCalled();
  });

  it("propagates a rejected editor insertion", () => {
    const element = receiver();
    const unregister = registerLinkDrop(element, () => false);
    expect(
      dropOn(
        { element },
        { label: "Entity", link: { kind: "note", id: "note" } },
        0,
        0,
      ),
    ).toBe(false);
    expect(element.dataset.dropped).toBeUndefined();
    unregister();
  });

  it("propagates a rejected canvas drop", async () => {
    const { tokenDrop } = await import("../canvasState");
    tokenDrop.value = vi.fn(() => false);
    expect(
      dropOn({ element: receiver({}, true) }, { label: "Entity" }, 0, 0),
    ).toBe(false);
    tokenDrop.value = null;
  });

  it("rechecks inventory target identity and editability", async () => {
    const { canEdit, addItem } = await import("../../characters/api");
    const element = receiver({ itemDrop: "recipient" });
    const dragged = tokenEntity(campaign, token({ itemDefId: "item" }))!;
    vi.mocked(canEdit).mockReturnValueOnce(false);
    expect(dropOn({ element, characterId: "recipient" }, dragged, 0, 0)).toBe(
      false,
    );
    element.dataset.itemDrop = "another";
    expect(dropOn({ element, characterId: "recipient" }, dragged, 0, 0)).toBe(
      false,
    );
    expect(addItem).not.toHaveBeenCalled();
  });
});

describe("tokenEntity", () => {
  it.each(["character", "item", "move", "note", "scene"] as const)(
    "resolves a linked %s token",
    (kind) => {
      const dragged = tokenEntity(
        campaign,
        token({ entityRef: { kind, id: kind } }),
      )!;
      expect(dragged.link).toEqual({ kind, id: kind });
      expect(dragged.label).toBe("Scene name");
      expect(!!dragged.pin).toBe(kind !== "note");
      expect(dragged.give?.kind).toBe(
        kind === "item" || kind === "move" ? kind : undefined,
      );
    },
  );

  it("preserves item identity and token appearance", async () => {
    const graphic = { kind: "icon", name: "gem" } as const;
    const dragged = tokenEntity(
      campaign,
      token({ itemDefId: "item", graphic }),
    )!;
    expect(dragged.token).toMatchObject({
      name: "Scene name",
      itemDefId: "item",
      graphic,
      style: "disc",
      colour: "#fff",
    });
    dragged.give!.to("recipient");
    const { addItem } = await import("../../characters/api");
    expect(addItem).toHaveBeenCalledWith(
      campaign,
      "recipient",
      { id: "item", name: "Sword" },
      true,
    );
  });

  it("prefers specialized character identity over a generic reference", () => {
    expect(
      tokenEntity(
        campaign,
        token({
          characterId: "character",
          entityRef: { kind: "item", id: "item" },
        }),
      )!.link,
    ).toEqual({ kind: "character", id: "character" });
  });

  it("rejects unlinked, unknown and missing entities", () => {
    expect(tokenEntity(campaign, token())).toBeNull();
    expect(
      tokenEntity(
        campaign,
        token({ entityRef: { kind: "unknown", id: "item" } }),
      ),
    ).toBeNull();
    expect(tokenEntity(campaign, token({ itemDefId: "missing" }))).toBeNull();
  });
});
