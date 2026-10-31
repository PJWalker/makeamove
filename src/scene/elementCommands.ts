import { device } from "../store/device";
import type { CampaignDefaults } from "../store/campaign";
import type { EntityGraphic, EntityGraphicRef } from "../graphics";
import { importImage } from "./images";
import { colourOf } from "./presence";
import { snapPoint, snapSize, type Point } from "./grid";
import type { SceneDoc } from "./sceneDoc";
import { activeTool } from "./tools";
import {
  LAYERS,
  type BlobRef,
  type Layer,
  type NewElement,
  type SceneElement,
  type TokenElement,
  type TokenStyle,
} from "./types";
import type { SceneRenderer } from "./renderer";

interface SceneCommandContext {
  scene: SceneDoc;
  renderer: SceneRenderer;
  host: HTMLElement;
  defaults: () => CampaignDefaults;
  elements: () => readonly SceneElement[];
  element: (id: string) => SceneElement | undefined;
  selection: { value: string[] };
  afterDuplicate: (ids: string[]) => void;
  updateCursor: () => void;
}

const memberColour = () => colourOf(device.value);

export class SceneElementCommands {
  constructor(private readonly context: SceneCommandContext) {}

  remove(ids: string[]) {
    const removable = ids.filter(
      (id) => this.context.element(id) && !this.context.element(id)!.locked,
    );
    if (!removable.length) return;
    this.context.scene.remove(removable);
    this.context.selection.value = this.context.selection.value.filter(
      (id) => !removable.includes(id),
    );
  }

  duplicate(ids: string[]) {
    if (!ids.length) return;
    const grid = this.context.renderer.grid;
    const copies = this.context.scene.duplicate(
      ids,
      grid.type === "none" ? 20 : grid.size,
    );
    this.context.afterDuplicate(copies);
    this.context.selection.value = copies;
  }

  setLocked(ids: string[], locked: boolean) {
    this.context.scene.update(ids.map((id) => [id, { locked }]));
  }

  restack(ids: string[], to: "front" | "back") {
    this.context.scene.restack(ids, to);
  }

  setLayer(ids: string[], layer: Layer) {
    this.context.scene.setLayer(ids, layer);
  }

  updateToken(
    id: string,
    patch: Partial<
      Pick<
        TokenElement,
        | "name"
        | "style"
        | "colour"
        | "characterId"
        | "graphic"
        | "entityRef"
        | "itemDefId"
        | "hideName"
        | "hideBars"
      >
    >,
    cells?: number,
  ) {
    const element = this.context.element(id);
    const grid = this.context.renderer.grid;
    const size = cells && element ? cells * grid.size : 0;
    const resize =
      size &&
      element &&
      (Math.abs(element.w - size) > 0.5 || Math.abs(element.h - size) > 0.5);
    this.context.scene.update([
      [
        id,
        resize
          ? { ...patch, ...snapPoint(grid, element, cells), w: size, h: size }
          : patch,
      ],
    ]);
  }

  tokenNames(): string[] {
    return this.context
      .elements()
      .flatMap((element) => (element.type === "token" ? [element.name] : []));
  }

  convert(id: string, to: "map" | "token") {
    const element = this.context.element(id);
    if (!element || element.type === to) return;
    const grid = this.context.renderer.grid;
    if (to === "token") {
      if (element.type !== "map") return;
      const image = element.image;
      const size = snapSize(grid, Math.min(element.w, element.h, grid.size));
      const position = snapPoint(grid, element, Math.round(size / grid.size));
      const token = {
        type: "token",
        name: "",
        graphic: { kind: "image", image },
        colour: memberColour(),
        style: this.context.defaults().tokenStyle,
        ...position,
        w: size,
        h: size,
        rot: 0,
      };
      this.context.scene.update([[id, token as Partial<SceneElement>]]);
    } else {
      if (element.type !== "token" || element.graphic?.kind !== "image") return;
      const image = element.graphic.image;
      const scale = element.w / Math.max(image.width, image.height);
      const map = {
        type: "map",
        image,
        name: undefined,
        colour: undefined,
        style: undefined,
        w: image.width * scale,
        h: image.height * scale,
      };
      this.context.scene.update([[id, map as Partial<SceneElement>]]);
    }
    this.context.scene.setLayer([id], to);
  }

  addToken(
    at: Point,
    name = "",
    options: {
      graphic?: EntityGraphic;
      entityRef?: EntityGraphicRef;
      itemDefId?: string;
      style?: TokenStyle;
      colour?: string;
    } = {},
  ) {
    const grid = this.context.renderer.grid;
    const size = grid.type === "none" ? 70 : grid.size;
    const [id] = this.context.scene.add({
      type: "token",
      layer: "token",
      name,
      graphic: options.graphic,
      entityRef: options.entityRef,
      itemDefId: options.itemDefId,
      colour: options.colour ?? memberColour(),
      style:
        options.style ??
        (options.graphic?.kind === "image"
          ? this.context.defaults().tokenStyle
          : "disc"),
      ...snapPoint(grid, at),
      w: size,
      h: size,
      rot: 0,
    });
    activeTool.value = "select";
    this.context.selection.value = [id];
    return id;
  }

  addCharacterToken(
    at: Point,
    spec: {
      characterId: string;
      name: string;
      graphic?: EntityGraphic;
      entityRef?: EntityGraphicRef;
      style?: TokenStyle;
      colour?: string;
    },
  ) {
    const grid = this.context.renderer.grid;
    const size = grid.type === "none" ? 70 : grid.size;
    const [id] = this.context.scene.add({
      type: "token",
      layer: "token",
      name: spec.name,
      characterId: spec.characterId,
      graphic: spec.graphic,
      entityRef: spec.entityRef ?? { kind: "character", id: spec.characterId },
      colour: spec.colour ?? memberColour(),
      style:
        spec.style ??
        (spec.graphic?.kind === "image"
          ? this.context.defaults().tokenStyle
          : "disc"),
      ...snapPoint(grid, at),
      w: size,
      h: size,
      rot: 0,
    });
    activeTool.value = "select";
    this.context.selection.value = [id];
    return id;
  }

  async importFiles(files: Iterable<File>, at: Point) {
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    this.context.host.style.cursor = "progress";
    const grid = this.context.renderer.grid;
    const added: NewElement[] = [];
    try {
      for (const [index, file] of images.entries()) {
        let image: BlobRef;
        try {
          image = await importImage(file);
        } catch (error) {
          console.warn(`Couldn't import ${file.name}`, error);
          continue;
        }
        const shift = index * (grid.type === "none" ? 40 : grid.size);
        const position = { x: at.x + shift, y: at.y + shift };
        const ratio = image.width / image.height;
        if (
          Math.max(image.width, image.height) <= 512 &&
          ratio > 0.8 &&
          ratio < 1.25
        ) {
          const size = grid.type === "none" ? 70 : grid.size;
          added.push({
            type: "token",
            layer: "token",
            graphic: { kind: "image", image },
            name: tokenName(file.name),
            colour: memberColour(),
            style: this.context.defaults().tokenStyle,
            ...snapPoint(grid, position),
            w: size,
            h: size,
            rot: 0,
          });
        } else {
          added.push({
            type: "map",
            layer: "map",
            image,
            ...position,
            w: image.width,
            h: image.height,
            rot: 0,
          });
        }
      }
    } finally {
      this.context.updateCursor();
    }
    if (!added.length) return;
    activeTool.value = "select";
    this.context.selection.value = this.context.scene.add(...added);
  }

  layers() {
    return LAYERS;
  }
}

function tokenName(file: string): string {
  const base = file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return base ? base[0].toUpperCase() + base.slice(1) : "";
}
