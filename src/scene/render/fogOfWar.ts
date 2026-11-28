import { AlphaFilter, Container, Graphics } from "pixi.js";
import { fogPasses, fogShade, tokenShows } from "../fog";
import type { FogCover, FogMode, FogPass } from "../fog";
import { insidePolygon, shapeCovers, shapePolygon } from "../geometry";
import type { Point } from "../grid";
import { Lamp } from "../lampShader";
import type { Box } from "../vision";
import type { Sight } from "./lighting";
import { UNSEEN } from "./lighting";
import type { RenderState } from "./state";
import { flat } from "./style";

/** A scene's fog of war: how it's revealed, and what its characters have seen. */
export interface FogOfWar {
  mode: FogMode;
  /** What characters have seen, each a polygon in the world. */
  explored: Point[][];
}

/** How strongly the GM sees the fog, so they can tell what players see and still see under it. */
const GM_STRENGTH = 0.45;

/**
 * Fog of war over everything players haven't had revealed. It's painted as
 * the passes fog.ts proves leave exactly the revealed places clear: cover
 * everything, clear what's been explored, what's in sight and what the GM
 * revealed, then cover what the GM hid.
 */
export class FogOfWarLayer {
  readonly view = new Container();
  fog: FogOfWar = { mode: "none", explored: [] };
  /** Whether this device sees under the fog (the GM's). */
  seeAll = false;
  private readonly cover = new Graphics();
  private readonly clearExplored = new Graphics({ blendMode: "erase" });
  private readonly clearSight = new Container();
  private readonly clearRevealed = new Graphics({ blendMode: "erase" });
  private readonly coverHidden = new Graphics();
  private readonly passes: Record<FogPass, Container> = {
    cover: this.cover,
    clearExplored: this.clearExplored,
    clearSight: this.clearSight,
    clearRevealed: this.clearRevealed,
    coverHidden: this.coverHidden,
  };
  private readonly lamps: Lamp[] = [];

  constructor(private readonly state: RenderState) {
    // Rendered apart, so its erasing only cuts its own fog.
    this.view.filters = [new AlphaFilter()];
  }

  draw(sight: Sight | null, box: Box) {
    const { mode, explored } = this.fog;
    const passes = fogPasses(mode);
    this.view.visible = passes.length > 0;
    this.view.removeChildren();
    if (!this.view.visible) {
      this.setLamps(0);
      return;
    }
    const s = this.state;
    const alpha = this.seeAll ? GM_STRENGTH : 1;
    const cover = this.cover.clear();
    const clearExplored = this.clearExplored.clear();
    const clearRevealed = this.clearRevealed.clear();
    const coverHidden = this.coverHidden.clear();
    cover.rect(box.x, box.y, box.w, box.h).fill({ color: UNSEEN, alpha });
    for (const poly of explored) clearExplored.poly(flat(poly)).fill({ color: 0xff_ff_ff });
    for (const element of s.elements) {
      if (element.type !== "fog" || s.hidden.has(element.id)) continue;
      const poly = flat(shapePolygon({ ...element, ...s.previews.get(element.id) }));
      if (element.force === "reveal") clearRevealed.poly(poly).fill({ color: 0xff_ff_ff });
      else coverHidden.poly(poly).fill({ color: UNSEEN, alpha });
    }
    const from = sight?.from ?? [];
    this.setLamps(from.length);
    for (const [index, at] of from.entries())
      this.lamps[index]!.update({
        at,
        radius: 0.75 / s.camera.zoom,
        falloff: null,
        box,
        walls: sight!.walls,
      });
    this.view.addChild(...passes.map((p) => this.passes[p]));
  }

  /** Keep `n` sight lamps, one for each place the viewers see from. */
  private setLamps(n: number) {
    while (this.lamps.length < n) {
      const lamp = new Lamp();
      this.clearSight.addChild(lamp.mesh);
      this.lamps.push(lamp);
    }
    for (const lamp of this.lamps.splice(n)) lamp.destroy();
  }

  /**
   * Whether a place looks clear to this device, rather than dimmed or
   * hidden: fog.ts decides from what covers it, and whether it's in the
   * viewers' sight (`vision`: whether they see only what their tokens see).
   */
  clear(p: Point, inSight: boolean, vision: boolean): boolean {
    const { mode, cover } = this.coverAt(p, inSight);
    return fogShade(mode, vision, cover) === "clear";
  }

  /** Whether a token there shows to this device: one it sees through (`own`) always, else as fog.ts's `tokenShows` decides. */
  showsToken(p: Point, t: { own: boolean; inSight: boolean; vision: boolean }): boolean {
    const { mode, cover } = this.coverAt(p, t.inSight);
    return tokenShows(mode, { own: t.own, vision: t.vision, cover });
  }

  /** The fog mode this device sees by, and what covers a place. */
  private coverAt(p: Point, inSight: boolean): { mode: FogMode; cover: FogCover } {
    const s = this.state;
    const mode = this.seeAll ? "none" : this.fog.mode;
    const fogShapes = (force: "hide" | "reveal") =>
      mode !== "none" &&
      s.elements.some(
        (element) =>
          element.type === "fog" &&
          element.force === force &&
          !s.hidden.has(element.id) &&
          shapeCovers({ ...element, ...s.previews.get(element.id) }, p),
      );
    return {
      mode,
      cover: {
        hidden: fogShapes("hide"),
        revealed: fogShapes("reveal"),
        explored: mode === "auto" && this.fog.explored.some((poly) => insidePolygon(poly, p)),
        inSight,
      },
    };
  }
}
