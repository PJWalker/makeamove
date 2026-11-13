import {
  CanvasSource,
  Color,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Rectangle,
  Texture,
} from "pixi.js";
import { insidePolygon, shapeOutline } from "../geometry";
import type { Point } from "../grid";
import { distanceToSegment } from "../stroke";
import type { EffectElement, EffectKind, Transform } from "../types";
import { flat } from "./style";

/*
 * Effect zones (rain, snow, fog, embers, magic), drawn as drifts of
 * particles. Each particle's place is worked out afresh from the time, so
 * every frame is cheap and a still frame (reduced motion) is just time 0.
 * Particles fade out towards the zone's edge rather than being cut off by
 * it, so clouds have soft edges whatever the shape. The effect's colour
 * tints its particles, and its opacity is how strong the effect is.
 */

type Sprite = "dot" | "streak" | "puff" | "star";

/** One drift of particles in an effect, all alike. */
interface Drift {
  sprite: Sprite;
  /** Particles per 10,000 world px² (about two cells). */
  density: number;
  /** Width in world px, from smallest to largest. */
  size: [number, number];
  /** Height over width. */
  aspect?: number;
  /** World px per second. */
  velocity: Point;
  /** Side to side wander: how far in world px, and how many times a second. */
  sway?: [number, number];
  alpha: [number, number];
  /** Fade in and out over a life this many seconds long, then start again somewhere else. */
  life?: number;
  /** Twinkles a second. */
  twinkle?: number;
  /** Turns a second, either way. */
  spin?: number;
  /** World px in from the zone's edge over which the particles fade. */
  edge: number;
  /** Add light rather than cover what's under it. */
  glow?: boolean;
}

/** How each effect looks: its drifts, bottom to top. */
const DRIFTS: Record<EffectKind, Drift[]> = {
  rain: [
    {
      sprite: "puff",
      density: 0.25,
      size: [140, 220],
      velocity: { x: -20, y: 40 },
      alpha: [0.05, 0.1],
      edge: 60,
    },
    {
      sprite: "streak",
      density: 7,
      size: [1.4, 2.2],
      aspect: 16,
      velocity: { x: -140, y: 1100 },
      alpha: [0.25, 0.55],
      edge: 10,
    },
  ],
  snow: [
    {
      sprite: "dot",
      density: 5,
      size: [3, 8],
      velocity: { x: -12, y: 45 },
      sway: [14, 0.3],
      alpha: [0.6, 0.95],
      edge: 16,
    },
  ],
  fog: [
    {
      sprite: "puff",
      density: 1.8,
      size: [160, 300],
      velocity: { x: 12, y: 4 },
      sway: [20, 0.05],
      alpha: [0.22, 0.4],
      spin: 0.04,
      edge: 90,
    },
  ],
  embers: [
    {
      sprite: "puff",
      density: 0.25,
      size: [100, 180],
      velocity: { x: 0, y: -8 },
      alpha: [0.1, 0.2],
      edge: 60,
      glow: true,
    },
    {
      sprite: "dot",
      density: 5,
      size: [4, 10],
      velocity: { x: 6, y: -55 },
      sway: [10, 0.5],
      alpha: [0.6, 1],
      life: 3,
      edge: 12,
      glow: true,
    },
  ],
  magic: [
    {
      sprite: "puff",
      density: 0.3,
      size: [90, 160],
      velocity: { x: 0, y: -4 },
      sway: [16, 0.08],
      alpha: [0.08, 0.18],
      edge: 60,
      glow: true,
    },
    {
      sprite: "star",
      density: 1.5,
      size: [8, 16],
      velocity: { x: 0, y: -12 },
      sway: [12, 0.2],
      alpha: [0.5, 1],
      twinkle: 1.2,
      spin: 0.6,
      life: 5,
      edge: 16,
      glow: true,
    },
  ],
};

/** Most particles in one drift, however big the zone. */
const MAX_PARTICLES = 600;

/** A particle's own fixed randomness: where in the zone it starts, how big, and its phase. */
interface Seed {
  u: number;
  v: number;
  size: number;
  alpha: number;
  phase: number;
  spin: number;
}

/** A repeatable random sequence, so an effect looks the same each time it's drawn. */
function random(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const fract = (n: number) => n - Math.floor(n);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * How visible a particle is at each point of the zone's box, from 0 outside
 * it to 1 well inside, in a coarse grid over the box.
 */
class EdgeFade {
  private readonly values: Float32Array;
  private readonly cols: number;
  private readonly rows: number;

  constructor(
    outline: Point[],
    rot: number,
    private readonly box: { w: number; h: number },
    edge: number,
    private readonly cell = Math.max(6, Math.max(box.w, box.h) / 64),
  ) {
    this.cols = Math.ceil(box.w / cell) + 1;
    this.rows = Math.ceil(box.h / cell) + 1;
    const depth = new Float32Array(this.cols * this.rows);
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    let deepest = 0;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const wx = i * cell - box.w / 2;
        const wy = j * cell - box.h / 2;
        const p = { x: wx * cos - wy * sin, y: wx * sin + wy * cos };
        if (!insidePolygon(outline, p)) continue;
        let d = Infinity;
        for (let k = 0; k < outline.length; k++) {
          const a = outline[k]!;
          const b = outline[(k + 1) % outline.length]!;
          d = Math.min(d, distanceToSegment(p.x, p.y, a.x, a.y, b.x, b.y));
        }
        depth[j * this.cols + i] = d;
        deepest = Math.max(deepest, d);
      }
    }
    // A thin zone fades over less, so something still shows in it.
    const fade = Math.max(1, Math.min(edge, deepest * 0.7));
    this.values = depth.map((d) => smooth(Math.min(1, d / fade)));
  }

  /** At a point relative to the zone's centre. */
  at(x: number, y: number): number {
    const i = Math.round((x + this.box.w / 2) / this.cell);
    const j = Math.round((y + this.box.h / 2) / this.cell);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return 0;
    return this.values[j * this.cols + i]!;
  }
}

/** A drift of particles, drawn in one batch. */
class DriftView {
  readonly container: ParticleContainer;
  private particles: Particle[] = [];
  private seeds: Seed[] = [];
  private fade: EdgeFade | null = null;
  private box = { w: 0, h: 0 };

  constructor(
    private readonly drift: Drift,
    private readonly id: string,
  ) {
    this.container = new ParticleContainer({
      texture: spriteTexture(drift.sprite),
      dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
    });
    if (drift.glow) this.container.blendMode = "add";
  }

  /** Fit the drift to the zone: as many particles as its area calls for, fading at its edge. */
  fit(outline: Point[], t: Transform) {
    const d = this.drift;
    // The zone's box, unrotated, so rain falls down the screen whichever way the zone turns.
    const cos = Math.abs(Math.cos(t.rot));
    const sin = Math.abs(Math.sin(t.rot));
    this.box = { w: t.w * cos + t.h * sin, h: t.w * sin + t.h * cos };
    this.fade = new EdgeFade(outline, t.rot, this.box, d.edge);
    const area = (t.w * t.h) / 10_000;
    const count = Math.min(MAX_PARTICLES, Math.max(1, Math.round(area * d.density)));
    if (count === this.particles.length) return;
    const next = random(`${this.id}:${d.sprite}`);
    const start = { u: next(), v: next() };
    // Spread evenly over the zone (an R2 sequence), so there are no clumps or gaps.
    this.seeds = Array.from({ length: count }, (_, i) => ({
      u: fract(start.u + i * 0.7548776662),
      v: fract(start.v + i * 0.569840291),
      size: lerp(d.size[0], d.size[1], next()),
      alpha: lerp(d.alpha[0], d.alpha[1], next()),
      phase: next(),
      spin: (next() * 2 - 1) * (d.spin ?? 0),
    }));
    this.particles = this.seeds.map(
      () => new Particle({ texture: this.container.texture, anchorX: 0.5, anchorY: 0.5 }),
    );
    this.container.particleChildren = this.particles;
    this.container.update();
  }

  /** Place every particle for the time `time`, in seconds, in a colour at a strength (its opacity). */
  draw(time: number, tint: number, strength: number) {
    const d = this.drift;
    const { w, h } = this.box;
    const fade = this.fade;
    if (!fade) return;
    const angle = Math.atan2(d.velocity.y, d.velocity.x) - Math.PI / 2;
    for (let i = 0; i < this.particles.length; i++) {
      const s = this.seeds[i]!;
      const p = this.particles[i]!;
      // A particle with a life starts its next one somewhere else.
      const age = d.life ? time / d.life + s.phase : 0;
      const cycle = Math.floor(age);
      const u = fract(s.u + cycle * 0.618034);
      const v = fract(s.v + cycle * 0.414214);
      const sway = d.sway ? d.sway[0] * Math.sin((time * d.sway[1] + s.phase) * Math.PI * 2) : 0;
      const x = fract((u * w + d.velocity.x * time + sway) / w) * w - w / 2;
      const y = fract((v * h + d.velocity.y * time) / h) * h - h / 2;
      let alpha = s.alpha * strength * fade.at(x, y);
      if (d.life) alpha *= Math.sin(fract(age) * Math.PI);
      if (d.twinkle) alpha *= 0.55 + 0.45 * Math.sin((time * d.twinkle + s.phase) * Math.PI * 2);
      p.x = x;
      p.y = y;
      p.scaleX = s.size / SPRITE_SIZE[d.sprite].w;
      p.scaleY = (s.size * (d.aspect ?? 1)) / SPRITE_SIZE[d.sprite].h;
      p.rotation = d.aspect ? angle : s.phase * Math.PI * 2 + s.spin * time;
      p.tint = tint;
      p.alpha = alpha;
    }
  }
}

/** An effect zone's drawing: its drifts of particles, and the outline the GM sees. */
export class EffectView {
  readonly root = new Container({ cullable: true });
  /** The zone's outline, which only the GM sees, and only while effects can be picked. */
  readonly outline = new Graphics();
  private readonly drifts: DriftView[];
  private colour = new Color();

  constructor(private readonly el: EffectElement) {
    this.drifts = DRIFTS[el.effect].map((d) => new DriftView(d, el.id));
    this.root.addChild(...this.drifts.map((d) => d.container), this.outline);
  }

  /** Move or resize the zone, or change its colour while one is being picked. */
  apply(t: Transform) {
    const { colour } = { ...this.el, ...t } as EffectElement;
    this.colour = new Color(colour);
    this.root.position.set(t.x, t.y);
    const outline = shapeOutline(this.el, t.w, t.h);
    for (const d of this.drifts) d.fit(outline, t);
    // Its particles have no bounds of their own, so it's culled by its box.
    const r = Math.hypot(t.w, t.h) / 2;
    this.root.boundsArea = new Rectangle(-r, -r, r * 2, r * 2);
    this.outline.rotation = t.rot;
    this.outline
      .clear()
      .poly(flat(outline))
      .fill({ color: this.colour.toNumber(), alpha: 0.06 })
      .stroke({ color: this.colour.toNumber(), width: 2, alpha: 0.7 });
  }

  /** Draw the particles as they are at `time`, in seconds. */
  animate(time: number) {
    const tint = this.colour.toNumber();
    for (const d of this.drifts) d.draw(time, tint, this.colour.alpha);
  }
}

/** The size each sprite's texture is drawn at, in px. */
const SPRITE_SIZE: Record<Sprite, { w: number; h: number }> = {
  dot: { w: 32, h: 32 },
  streak: { w: 8, h: 64 },
  puff: { w: 128, h: 128 },
  star: { w: 32, h: 32 },
};

const sprites = new Map<Sprite, Texture>();

/**
 * A white sprite's texture, tinted by the effect's colour when drawn. Made the
 * first time it's needed and kept: they're tiny, and a renderer uploads them afresh.
 */
function spriteTexture(sprite: Sprite): Texture {
  let texture = sprites.get(sprite);
  if (!texture) {
    const { w, h } = SPRITE_SIZE[sprite];
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    paintSprite(canvas.getContext("2d")!, sprite, w, h);
    texture = new Texture({ source: new CanvasSource({ resource: canvas }) });
    sprites.set(sprite, texture);
  }
  return texture;
}

/** A soft round spot of white, from solid at its middle to clear at `r`. */
function spot(g: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 1) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
  grad.addColorStop(0.4, `rgba(255,255,255,${alpha * 0.6})`);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function paintSprite(g: CanvasRenderingContext2D, sprite: Sprite, w: number, h: number) {
  switch (sprite) {
    case "dot":
      spot(g, w / 2, h / 2, w / 2);
      return;
    case "streak": {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.7, "rgba(255,255,255,0.9)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(w / 4, 0, w / 2, h);
      return;
    }
    case "puff": {
      // A lumpy cloud: soft spots clustered about the middle.
      const next = random("puff");
      for (let i = 0; i < 9; i++) {
        const a = next() * Math.PI * 2;
        const d = next() * w * 0.18;
        spot(g, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, w * (0.22 + next() * 0.12), 0.35);
      }
      return;
    }
    case "star": {
      spot(g, w / 2, h / 2, w / 2, 0.5);
      g.fillStyle = "#fff";
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? w * 0.08 : w * 0.48;
        const a = (i / 8) * Math.PI * 2;
        g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
      }
      g.fill();
      return;
    }
  }
}
