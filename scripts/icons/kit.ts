import {
  CanvasTexture,
  type BufferGeometry,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Object3D,
} from "three";

/*
 * The adventurer's kit: the materials every icon is made from, so the set
 * reads as one collection of worn, well-used objects. Textures are drawn
 * procedurally with a seeded random source so renders are reproducible.
 */

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D_2B_79_F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Draw = (context: CanvasRenderingContext2D, random: () => number, w: number, h: number) => void;

export function drawnTexture(w: number, h: number, seed: number, draw: Draw, colour = true) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context");
  draw(context, seeded(seed), w, h);
  const texture = new CanvasTexture(canvas);
  if (colour) texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Soft blotches over a base colour: the mottling of old hide and paper. */
export function mottle(
  context: CanvasRenderingContext2D,
  random: () => number,
  w: number,
  h: number,
  colour: string,
  count: number,
  radius: [number, number],
) {
  context.fillStyle = colour;
  for (let index = 0; index < count; index++) {
    const r = radius[0] + random() * (radius[1] - radius[0]);
    context.beginPath();
    context.ellipse(random() * w, random() * h, r, r * (0.5 + random()), random() * Math.PI, 0, 7);
    context.fill();
  }
}

/** Darkened edges, like paper handled for years. */
export function vignette(context: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  const g = context.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.72,
  );
  g.addColorStop(0, "rgba(90,50,10,0)");
  g.addColorStop(1, `rgba(90,50,10,${strength})`);
  context.fillStyle = g;
  context.fillRect(0, 0, w, h);
}

export function parchmentBase(
  context: CanvasRenderingContext2D,
  random: () => number,
  w: number,
  h: number,
) {
  context.fillStyle = "#ead6a6";
  context.fillRect(0, 0, w, h);
  mottle(context, random, w, h, "rgba(160,110,40,0.06)", 160, [w * 0.02, w * 0.12]);
  mottle(context, random, w, h, "rgba(255,245,215,0.08)", 80, [w * 0.02, w * 0.08]);
  vignette(context, w, h, 0.55);
}

function leatherTexture(base: string, seed: number) {
  return drawnTexture(256, 256, seed, (context, random, w, h) => {
    context.fillStyle = base;
    context.fillRect(0, 0, w, h);
    mottle(context, random, w, h, "rgba(0,0,0,0.08)", 90, [8, 40]);
    mottle(context, random, w, h, "rgba(255,220,180,0.05)", 60, [6, 30]);
    for (let index = 0; index < 5000; index++) {
      context.fillStyle = random() < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,230,200,0.06)";
      context.fillRect(random() * w, random() * h, 1.5, 1.5);
    }
  });
}

function grainTexture(base: string, line: string, seed: number) {
  return drawnTexture(256, 256, seed, (context, random, w, h) => {
    context.fillStyle = base;
    context.fillRect(0, 0, w, h);
    context.strokeStyle = line;
    for (let index = 0; index < 40; index++) {
      const y0 = random() * h;
      context.lineWidth = 0.5 + random() * 2;
      context.beginPath();
      for (let x = 0; x <= w; x += 8)
        context.lineTo(x, y0 + Math.sin(x * 0.03 + index) * 4 + random() * 1.5);
      context.stroke();
    }
  });
}

export const kit = {
  brass: () =>
    new MeshPhysicalMaterial({
      color: 0xE0_A8_3C,
      metalness: 1,
      roughness: 0.26,
      clearcoat: 0.2,
      envMapIntensity: 2.2,
    }),
  gold: () =>
    new MeshPhysicalMaterial({
      color: 0xF0_C2_4A,
      metalness: 1,
      roughness: 0.34,
      envMapIntensity: 2.4,
    }),
  /** Glossy vitreous enamel, for medallions and painted parts. */
  enamel: (color: number) =>
    new MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
  agedBrass: () =>
    new MeshStandardMaterial({
      color: 0xA8_7A_32,
      metalness: 1,
      roughness: 0.38,
      envMapIntensity: 2,
    }),
  iron: () =>
    new MeshStandardMaterial({
      color: 0x8A_85_80,
      metalness: 1,
      roughness: 0.32,
      envMapIntensity: 2,
    }),
  blackIron: () => new MeshStandardMaterial({ color: 0x2C_28_26, metalness: 0.8, roughness: 0.5 }),
  leather: (base = "#7a4320", seed = 3) => {
    const map = leatherTexture(base, seed);
    return new MeshStandardMaterial({ map, roughness: 0.68, bumpMap: map, bumpScale: 1.5 });
  },
  oak: (seed = 5) =>
    new MeshStandardMaterial({
      map: grainTexture("#8a5a2e", "rgba(60,30,10,0.35)", seed),
      roughness: 0.7,
    }),
  parchment: (draw?: Draw, seed = 7) =>
    new MeshStandardMaterial({
      map: drawnTexture(512, 512, seed, (context, random, w, h) => {
        parchmentBase(context, random, w, h);
        draw?.(context, random, w, h);
      }),
      roughness: 0.92,
    }),
  ivory: () =>
    new MeshPhysicalMaterial({
      color: 0xF1_E6_C8,
      roughness: 0.35,
      clearcoat: 0.4,
      sheen: 0.4,
      sheenColor: 0xFF_E8_C0,
    }),
  stone: (seed = 15) =>
    new MeshStandardMaterial({
      map: drawnTexture(256, 256, seed, (context, random, w, h) => {
        context.fillStyle = "#8d8a86";
        context.fillRect(0, 0, w, h);
        mottle(context, random, w, h, "rgba(40,36,34,0.12)", 120, [4, 30]);
        mottle(context, random, w, h, "rgba(255,250,240,0.08)", 80, [3, 20]);
      }),
      roughness: 0.85,
    }),
  /** Matte painted or dyed surfaces: cloth, clouds, painted wood. */
  matte: (color: number, roughness = 0.75) => new MeshStandardMaterial({ color, roughness }),
  /** Bronze gone green with age. */
  verdigris: () =>
    new MeshStandardMaterial({
      color: 0x4F_9A_86,
      metalness: 0.65,
      roughness: 0.42,
      envMapIntensity: 1.6,
    }),
  steel: () =>
    new MeshPhysicalMaterial({
      color: 0xB8_C4_D0,
      metalness: 1,
      roughness: 0.34,
      envMapIntensity: 2.2,
    }),
  gem: (color: number) =>
    new MeshPhysicalMaterial({
      color,
      roughness: 0.05,
      clearcoat: 1,
      metalness: 0.1,
      emissive: color,
      emissiveIntensity: 0.25,
    }),
  lacquer: (color: number) =>
    new MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
  ink: () => new MeshPhysicalMaterial({ color: 0x1B_22_30, roughness: 0.15, clearcoat: 1 }),
};

/** A mesh that casts and catches shadows like every solid part of the kit. */
export function part(geometry: BufferGeometry, material: Material | Material[]): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function place<T extends Object3D>(
  object: T,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
): T {
  object.position.set(...position);
  object.rotation.set(...rotation);
  return object;
}
