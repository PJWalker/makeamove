import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { drawnTexture, kit, part, place } from "../kit";
import { badged, fit, outline, relief } from "../forms";
import { cog, d20, lathe, padlock, TAU } from "./core";
import { card, chest, folio, frame, page, pawn, slab } from "./props";

/* Scene elements, files, and actions on the canvas. */

export const token = () => pawn();

/** A brass compass, its needle swung toward the mark. */
export function target() {
  const group = new Group();
  const caseBody = part(
    lathe([
      [0, 0],
      [0.95, 0],
      [1, 0.08],
      [1, 0.22],
      [0.92, 0.26],
      [0.9, 0.18],
      [0, 0.18],
    ]),
    kit.brass(),
  );
  caseBody.rotation.x = Math.PI / 2;
  group.add(caseBody);
  const face = drawnTexture(256, 256, 2, (ctx, _r, w, h) => {
    ctx.fillStyle = "#efe4c6";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#5c3a1c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.42, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const r = i % 4 ? 0.36 : 0.3;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * w * r, h / 2 + Math.sin(a) * h * r);
      ctx.lineTo(w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * h * 0.42);
      ctx.stroke();
    }
  });
  const dial = part(new CylinderGeometry(0.9, 0.9, 0.02, 64), [
    kit.brass(),
    new MeshStandardMaterial({ map: face, roughness: 0.6 }),
    kit.brass(),
  ]);
  group.add(place(dial, [0, 0, 0.19], [Math.PI / 2, 0, 0]));
  const needle = new Shape();
  needle.moveTo(0, 0.75);
  needle.lineTo(0.13, 0);
  needle.lineTo(0, -0.75);
  needle.lineTo(-0.13, 0);
  const half = (from: number, colour: number) => {
    const shape = new Shape();
    shape.moveTo(0, from * 0.75);
    shape.lineTo(0.13, 0);
    shape.lineTo(-0.13, 0);
    return part(
      new ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }),
      kit.enamel(colour),
    );
  };
  const pointer = new Group().add(half(1, 0xc0392b), half(-1, 0x39424e));
  group.add(place(pointer, [0, 0, 0.21], [0, 0, -0.6]));
  group.add(place(part(new SphereGeometry(0.08, 12, 8), kit.gold()), [0, 0, 0.27]));
  return new Group().add(group);
}

export const roll = () => d20();

/** A letter folded and sealed with red wax. */
export function post() {
  const group = new Group();
  const paper = kit.parchment(undefined, 50);
  group.add(slab(2, 1.3, 0.06, paper, 0.04));
  const flap = new Shape();
  flap.moveTo(-1, 0.65);
  flap.lineTo(1, 0.65);
  flap.lineTo(0, -0.1);
  group.add(
    place(
      part(
        new ExtrudeGeometry(flap, { depth: 0.03, bevelEnabled: false }),
        kit.parchment(undefined, 51),
      ),
      [0, 0, 0.03],
    ),
  );
  const seal = part(new CylinderGeometry(0.28, 0.3, 0.08, 18), kit.lacquer(0xa3201a));
  group.add(place(seal, [0, -0.05, 0.1], [Math.PI / 2, 0, 0]));
  group.add(
    place(
      part(new CylinderGeometry(0.17, 0.17, 0.04, 24), kit.lacquer(0x8a1a14)),
      [0, -0.05, 0.15],
      [Math.PI / 2, 0, 0],
    ),
  );
  group.rotation.set(0, 0, 0.08);
  return new Group().add(group);
}

export const unlock = () => padlock(true);

/** A landscape in a gilded frame. */
export function image() {
  const group = new Group();
  const painting = drawnTexture(256, 200, 3, (ctx, random, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#3c78c8");
    sky.addColorStop(1, "#a8d4f0");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f6d55c";
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.3, w * 0.09, 0, TAU);
    ctx.fill();
    for (const [colour, base, amp] of [
      ["#4f8f3a", 0.62, 0.12],
      ["#2f6a2a", 0.78, 0.08],
    ] as const) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8)
        ctx.lineTo(x, h * (base - amp * Math.sin(x * 0.02 + random())));
      ctx.lineTo(w, h);
      ctx.fill();
    }
  });
  group.add(
    slab(1.8, 1.45, 0.04, new MeshStandardMaterial({ map: painting, roughness: 0.8 }), 0.01),
  );
  group.add(place(frame(2.1, 1.75, 0.2, 0.16, kit.gold()), [0, 0, 0.03]));
  return new Group().add(group);
}

const steelGlyph = (id: Parameters<typeof outline>[0]) => () =>
  place(relief(outline(id), kit.steel(), 0.3, 0.07), [0, 0, 0], [0, 0, 0]);

export const back = steelGlyph("ms:chevron-left-rounded");
export const folder = () => folio();
export const newFolder = () => badged(folio(), "add");
export const exportCampaign = () => badged(chest(), "down");
export const importCampaign = () => badged(chest(), "up");
export function backupFolder() {
  const group = new Group().add(fit(folio(), 2));
  const gear = fit(cog(), 0.95);
  group.add(place(new Group().add(gear), [0.62, -0.6, 0.9]));
  return group;
}

/** A slate tile ruled with a chalk grid. */
export function grid() {
  const group = new Group();
  group.add(slab(2, 2, 0.16, kit.matte(0x2e3442, 0.7), 0.12));
  const chalk = kit.matte(0xe6e2d6, 0.9);
  for (const at of [-0.5, 0, 0.5]) {
    group.add(place(part(new RoundedBoxGeometry(1.8, 0.05, 0.03, 1, 0.01), chalk), [0, at, 0.13]));
    group.add(place(part(new RoundedBoxGeometry(0.05, 1.8, 0.03, 1, 0.01), chalk), [at, 0, 0.13]));
  }
  return new Group().add(group);
}

function stack(front: number, behind: number) {
  const group = new Group();
  group.add(place(card(behind), [-0.4, 0.3, -0.2], [0, 0, 0.12]));
  group.add(place(card(front), [0.3, -0.2, 0.15], [0, 0, -0.08]));
  return new Group().add(group);
}
export const toFront = () => badged(stack(0x2f6fc2, 0x6a6470), "up");
export const toBack = () => badged(stack(0x6a6470, 0x2f6fc2), "down");

export function duplicate() {
  const group = new Group();
  group.add(place(page(43), [-0.3, 0.25, -0.15], [0, 0, 0.05]));
  group.add(place(page(43), [0.3, -0.25, 0.1], [0, 0, 0.05]));
  return new Group().add(group);
}

/** A parcel wrapped in crimson and tied with gold ribbon. */
export function give() {
  const group = new Group();
  group.add(part(new RoundedBoxGeometry(1.4, 1.1, 1.4, 2, 0.06), kit.lacquer(0xa8243a)));
  const ribbon = kit.gold();
  group.add(part(new RoundedBoxGeometry(0.22, 1.14, 1.44, 1, 0.02), ribbon));
  group.add(part(new RoundedBoxGeometry(1.44, 1.14, 0.22, 1, 0.02), ribbon));
  for (const side of [-1, 1]) {
    const loop = part(new TorusGeometry(0.22, 0.07, 10, 24), ribbon);
    group.add(place(loop, [side * 0.2, 0.7, 0], [0, 0, side * 0.6]));
  }
  group.rotation.set(0.25, 0, 0);
  return new Group().add(group);
}

/** A gold name tag on a red string. */
export function rename() {
  const group = new Group();
  const tag = new Shape();
  tag.moveTo(-0.9, -0.5);
  tag.lineTo(0.5, -0.5);
  tag.lineTo(0.95, 0);
  tag.lineTo(0.5, 0.5);
  tag.lineTo(-0.9, 0.5);
  const hole = new Shape();
  hole.absarc(0.55, 0, 0.1, 0, TAU, true);
  tag.holes.push(hole);
  const plate = part(
    new ExtrudeGeometry(tag, {
      depth: 0.08,
      bevelEnabled: true,
      bevelSize: 0.04,
      bevelThickness: 0.04,
    }),
    kit.gold(),
  );
  group.add(plate);
  const ink = kit.matte(0x5a3410, 0.6);
  for (const [y, w] of [
    [0.15, 1.0],
    [-0.15, 0.7],
  ] as const)
    group.add(
      place(part(new RoundedBoxGeometry(w, 0.09, 0.04, 1, 0.02), ink), [
        -0.3 - (1 - w) / 2,
        y,
        0.13,
      ]),
    );
  group.add(
    place(
      part(new TorusGeometry(0.3, 0.035, 8, 24), kit.lacquer(0xa3201a)),
      [0.95, 0.15, 0.05],
      [0.4, 0.3, 0],
    ),
  );
  group.rotation.set(0, 0, 0.25);
  return new Group().add(group);
}

/** An ivory keycap with the command key in gold. */
export function shortcut() {
  const group = new Group();
  group.add(part(new RoundedBoxGeometry(1.8, 1.8, 0.7, 4, 0.22), kit.ivory()));
  const key = relief(outline("ms:keyboard-command-key-rounded"), kit.gold(), 0.08, 0.03);
  key.scale.setScalar(0.62);
  group.add(place(key, [0, 0, 0.42]));
  return new Group().add(group);
}

export const fitView = () =>
  place(relief(outline("ms:fit-screen-rounded"), kit.gold(), 0.25, 0.06), [0, 0, 0], [0, 0, 0]);
export const undo = () =>
  place(
    relief(outline("ms:undo-rounded"), kit.enamel(0x4c7cc8), 0.3, 0.07),
    [0, 0, 0],
    [0, 0.3, 0],
  );
export const redo = () =>
  place(
    relief(outline("ms:redo-rounded"), kit.enamel(0x4c7cc8), 0.3, 0.07),
    [0, 0, 0],
    [0, -0.3, 0],
  );
