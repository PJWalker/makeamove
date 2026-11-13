import { AlphaFilter, Color, Container, Graphics } from "pixi.js";
import { visibleWorld } from "../camera";
import { areaPolygon, fromLocal, shapeOutline } from "../geometry";
import type { Point } from "../grid";
import { type Blocker, Lamp } from "../lampShader";
import type { EffectElement, SceneElement, Transform } from "../types";
import {
  blocked,
  blockingSegments,
  distanceToSegment,
  lightReach,
  type Segment,
  sightSegments,
  TOKEN_SHADE,
  tokenBlocker,
} from "../vision";
import type { RenderState } from "./state";
import { flat, reducedMotion } from "./style";

/** A scene's lighting: whether it's on, and how dark it is where no light reaches (0 to 1). */
export interface Lighting {
  enabled: boolean;
  darkness: number;
}

/** The sizes of a glowing effect's nested rings, which soften its edge. */
const GLOW_RINGS = Array.from({ length: 10 }, (_, i) => 1 - i * 0.05);

/** An angle from an id, so each flickering light keeps its own rhythm. */
function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 6283) / 1000;
}

/**
 * Light and sight: each light's colour washed over what it lights, the
 * darkness where lights don't reach, and fog over what the viewers can't see.
 */
export class LightingLayer {
  /** Each light's colour, washed over what it lights, under the darkness. */
  readonly tintLayer = new Container();
  /** Darkness where lights don't reach, with lights erased out of it. */
  readonly lightLayer = new Container();
  /** Everything outside the viewers' sight, with what they see erased out of it. */
  readonly fogLayer = new Container();
  private lightG = new Graphics();
  /** Each light's reach, erased from the darkness by the lamp shader. */
  private lampLayer = new Container();
  private lamps = new Map<string, Lamp>();
  private tints = new Map<string, Lamp>();
  /** The lights that flicker, with an offset so no two waver together. */
  private flickering: { lamps: Lamp[]; phase: number }[] = [];
  /** Glowing effects' colour, washed over them. */
  private glowTint = new Graphics();
  /** Areas of solid light, and glowing effects, erased from the darkness. */
  private lightErase = new Graphics({ blendMode: "erase" });
  /** Areas of solid dark, over everything else. */
  private lightDark = new Graphics();
  private fogG = new Graphics();
  private sights = new Map<string, Lamp>();
  /** Where the viewers see from and the walls in the way, for hiding the names of tokens they can't see. */
  private sight: { from: Point[]; walls: Segment[] } | null = null;

  constructor(private readonly state: RenderState) {
    // Each draws dark over the view and erases what's lit or seen; a filter
    // renders it apart, so the erasing only cuts its own darkness.
    this.lightLayer.addChild(this.lightG, this.lampLayer, this.lightErase, this.lightDark);
    this.lightLayer.filters = [new AlphaFilter()];
    this.tintLayer.addChild(this.glowTint);
    this.fogLayer.addChild(this.fogG);
    this.fogLayer.filters = [new AlphaFilter()];
  }

  /**
   * Darkness, with each light's reach erased out of it by the lamp shader
   * (scene/lampShader.ts), its walls and tokens casting soft shadows; then,
   * for a player, black over everything their tokens can't see, by the same
   * shader with a lamp a pixel across. The GM sees the darkness at half strength.
   */
  draw(lighting: Lighting, viewerIds: string[] | null) {
    const s = this.state;
    const view = visibleWorld(s.camera, s.size.width, s.size.height);
    const margin = Math.max(view.w, view.h);
    const box = {
      x: view.x - margin,
      y: view.y - margin,
      w: view.w + 2 * margin,
      h: view.h + 2 * margin,
    };
    const at = (el: SceneElement) => s.previews.get(el.id) ?? el;
    const placed: SceneElement[] = s.elements.map((el) => ({ ...el, ...at(el) }));
    const walls = blockingSegments(placed);
    const sightWalls = sightSegments(placed.filter((el) => !s.hidden.has(el.id)));

    const lg = this.lightG.clear();
    const erase = this.lightErase.clear();
    const dark = this.lightDark.clear();
    const glowTint = this.glowTint.clear();
    const { enabled, darkness } = lighting;
    const strength = viewerIds ? 1 : 0.5;
    const areas = s.elements.filter((el) => el.type === "area" && !s.hidden.has(el.id));
    this.lightLayer.visible =
      enabled && (darkness > 0 || areas.some((el) => el.type === "area" && el.tone === "dark"));
    const lit = new Set<string>();
    const tinted = new Set<string>();
    this.flickering = [];
    this.tintLayer.visible = enabled;
    if (enabled) {
      lg.rect(box.x, box.y, box.w, box.h).fill({
        color: 0x000000,
        alpha: darkness * strength,
      });
      const tokens = s.elements.filter((el) => el.type === "token" && !s.hidden.has(el.id)).map(at);
      for (const el of s.elements) {
        if (el.type !== "light" || s.hidden.has(el.id)) continue;
        const t = at(el);
        const centre = { x: t.x, y: t.y };
        const reach = lightReach(el.bright, el.dim);
        // Tokens in reach cast short shadows; one the lamp sits on (a torch carried) casts none.
        const blockers: Blocker[] = [];
        for (const k of tokens) {
          if (Math.hypot(k.x - t.x, k.y - t.y) >= reach + k.w) continue;
          const b = tokenBlocker(centre, k, Math.min(k.w, k.h));
          if (b) blockers.push({ ...b, strength: TOKEN_SHADE });
        }
        const state = {
          at: centre,
          radius: Math.min(t.w, t.h) / 2,
          falloff: { bright: el.bright, dim: el.dim },
          box: { x: t.x - reach, y: t.y - reach, w: reach * 2, h: reach * 2 },
          walls: walls.filter((w) => distanceToSegment(centre, w) < reach),
          blockers,
          colour: ({ ...el, ...t } as typeof el).colour,
        };
        const drawn: Lamp[] = [];
        if (this.lightLayer.visible) {
          lit.add(el.id);
          drawn.push(this.lampFor(this.lamps, el.id, this.lampLayer));
        }
        tinted.add(el.id);
        drawn.push(this.lampFor(this.tints, el.id, this.tintLayer, true));
        for (const lamp of drawn) lamp.update(state);
        if (el.flicker) this.flickering.push({ lamps: drawn, phase: hashPhase(el.id) });
      }
      for (const el of this.lightLayer.visible ? areas : []) {
        if (el.type !== "area") continue;
        const poly = flat(areaPolygon({ ...el, ...at(el) }));
        if (el.tone === "light") erase.poly(poly).fill({ color: 0xffffff, alpha: 1 });
        else dark.poly(poly).fill({ color: 0x000000, alpha: strength });
      }
      for (const el of placed) {
        if (el.type !== "effect" || !el.glow || s.hidden.has(el.id)) continue;
        this.glow(el, this.lightLayer.visible ? erase : null, glowTint);
      }
    }
    this.dropLamps(this.lamps, lit);
    this.dropLamps(this.tints, tinted);

    const fg = this.fogG.clear();
    const viewers = viewerIds?.map((id) => s.byId.get(id)).filter((el) => !!el) ?? null;
    this.fogLayer.visible = !!viewers?.length;
    this.sight = null;
    const seeing = new Set<string>();
    if (viewers?.length) {
      fg.rect(box.x, box.y, box.w, box.h).fill({ color: 0x05070c, alpha: 1 });
      const from = viewers.map((el) => {
        const t = at(el);
        return { id: el.id, at: { x: t.x, y: t.y } };
      });
      this.sight = { from: from.map((v) => v.at), walls: sightWalls };
      for (const v of from) {
        seeing.add(v.id);
        // An eye a pixel across, so the edge of sight is smooth but sharp.
        this.lampFor(this.sights, v.id, this.fogLayer).update({
          at: v.at,
          radius: 0.75 / s.camera.zoom,
          falloff: null,
          box,
          walls: sightWalls,
        });
      }
    }
    this.dropLamps(this.sights, seeing);
  }

  /**
   * A glowing effect: dim light through it, in its colour, at its strength
   * (its colour's opacity), softening towards its edge in nested rings.
   */
  private glow(el: EffectElement, erase: Graphics | null, tint: Graphics) {
    const colour = new Color(el.colour);
    const rings = GLOW_RINGS.length;
    // Rings that together lift the dark by half (dim light) in the middle.
    const lift = 1 - (1 - 0.5 * colour.alpha) ** (1 / rings);
    for (const k of GLOW_RINGS) {
      const poly = flat(shapeOutline(el, el.w * k, el.h * k).map((p) => fromLocal(el, p)));
      erase?.poly(poly).fill({ color: 0xffffff, alpha: lift });
      tint.poly(poly).fill({ color: colour.toNumber(), alpha: (0.14 * colour.alpha) / rings });
    }
  }

  /** The lamp drawn for a light or a viewer, made the first time it's needed. */
  private lampFor(lamps: Map<string, Lamp>, id: string, layer: Container, tint = false): Lamp {
    let lamp = lamps.get(id);
    if (!lamp) {
      lamp = new Lamp(tint);
      layer.addChild(lamp.mesh);
      lamps.set(id, lamp);
    }
    return lamp;
  }

  /**
   * Waver the flickering lights, by a few sines out of step with each other,
   * so it never quite repeats. Whether there are any, to draw the next frame.
   * Steady under reduced motion.
   */
  flicker(): boolean {
    if (!this.flickering.length || reducedMotion()) return false;
    const t = performance.now() / 1000;
    for (const { lamps, phase: p } of this.flickering) {
      const wave =
        0.5 * Math.sin(7.3 * t + p) +
        0.3 * Math.sin(13.7 * t + 2.1 * p) +
        0.2 * Math.sin(23.1 * t + 3.7 * p);
      const n = Math.min(1, Math.max(0, 0.55 + 0.45 * wave));
      for (const lamp of lamps) lamp.setFlicker(n);
    }
    return true;
  }

  /** Destroy the lamps not drawn this time. */
  private dropLamps(lamps: Map<string, Lamp>, keep: Set<string>) {
    for (const [id, lamp] of lamps) {
      if (keep.has(id)) continue;
      lamp.destroy();
      lamps.delete(id);
    }
  }

  /** Whether a token is out of the viewers' sight (always false when they see everything). */
  unseen(t: Transform): boolean {
    const sight = this.sight;
    return !!sight && sight.from.every((p) => blocked(p, t, sight.walls));
  }
}
