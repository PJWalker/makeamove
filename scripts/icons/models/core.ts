import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  Path,
  PlaneGeometry,
  PointLight,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { drawnTexture, kit, part, place } from "../kit";

export const TAU = Math.PI * 2;

export function lathe(profile: [number, number][], segments = 48) {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
}

/** A soft additive glow that lights the scene but stays out of the framing. */
export function glow(radius: number, colour: number, opacity: number) {
  const mesh = new Mesh(
    new SphereGeometry(radius, 24, 16),
    new MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  mesh.userData["glow"] = true;
  return mesh;
}

export function quillAndInkpot() {
  const group = new Group();
  const pot = part(
    lathe([
      [0, 0],
      [0.5, 0],
      [0.56, 0.05],
      [0.56, 0.32],
      [0.46, 0.48],
      [0.24, 0.56],
      [0.22, 0.66],
      [0.28, 0.69],
      [0.27, 0.75],
      [0.18, 0.75],
      [0, 0.7],
    ]),
    kit.ink(),
  );
  const collar = part(new TorusGeometry(0.235, 0.04, 12, 40), kit.brass());
  place(collar, [0, 0.6, 0], [Math.PI / 2, 0, 0]);
  group.add(pot, collar);

  // The feather: a vane bowed along its spine, rooted in the pot's mouth.
  const length = 2.1;
  const vane = new PlaneGeometry(1, length, 8, 40);
  const pos = vane.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const side = pos.getX(i); // -0.5..0.5
    const t = pos.getY(i) / length + 0.5; // 0 at the nib, 1 at the tip
    const shape = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.18) / 0.82))), 0.55);
    const width = (side < 0 ? 0.24 : 0.36) * shape;
    const x = side * 2 * width;
    pos.setXYZ(i, x, t * length, -Math.abs(x) * 0.35 + Math.sin(t * Math.PI) * 0.12);
  }
  vane.computeVertexNormals();
  const feather = drawnTexture(64, 256, 11, (ctx, random, w, h) => {
    ctx.fillStyle = "#f4ecdc";
    ctx.fillRect(0, 0, w, h);
    // Barbs, and dark bands toward the tip.
    ctx.strokeStyle = "rgba(120,100,80,0.25)";
    for (let y = 0; y < h; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y + 6);
      ctx.lineTo(w / 2, y);
      ctx.lineTo(w, y + 6);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(24,110,120,0.9)";
    for (const [y, b] of [
      [0, 30],
      [44, 14],
      [72, 8],
    ] as const)
      ctx.fillRect(0, y + random() * 2, w, b);
  });
  const quill = new Group();
  const vaneMesh = part(
    vane,
    new MeshStandardMaterial({ map: feather, roughness: 0.75, side: DoubleSide }),
  );
  const shaft = part(
    new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(0, -0.35, 0),
        new Vector3(0, length * 0.5, 0.13),
        new Vector3(0, length, 0.02),
      ]),
      24,
      0.025,
      8,
    ),
    kit.ivory(),
  );
  quill.add(vaneMesh, shaft);
  place(quill, [0.05, 0.5, 0], [0, 0, -0.62]);
  group.add(quill);
  return group;
}

export function lantern() {
  const group = new Group();
  const brass = kit.brass();
  const base = part(
    lathe([
      [0, 0],
      [0.62, 0],
      [0.68, 0.05],
      [0.62, 0.12],
      [0.56, 0.2],
      [0, 0.2],
    ]),
    kit.agedBrass(),
  );
  const glass = new Mesh(
    new CylinderGeometry(0.44, 0.44, 0.9, 32, 1, true),
    new MeshPhysicalMaterial({
      color: 0xfff1d0,
      emissive: 0xff9a3a,
      emissiveIntensity: 0.45,
      roughness: 0.1,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  place(glass, [0, 0.65, 0]);
  const candle = part(new CylinderGeometry(0.11, 0.12, 0.22, 16), kit.ivory());
  place(candle, [0, 0.31, 0]);
  const flame = new Mesh(
    new SphereGeometry(0.12, 16, 12),
    new MeshBasicMaterial({ color: 0xfff0b0 }),
  );
  flame.scale.set(1, 2, 1);
  place(flame, [0, 0.62, 0]);
  const halo = glow(0.36, 0xff9a3c, 0.5);
  place(halo, [0, 0.64, 0]);
  const light = new PointLight(0xffb060, 4, 3, 1.5);
  place(light, [0, 0.62, 0]);
  group.add(base, glass, candle, flame, halo, light);

  for (let i = 0; i < 4; i++) {
    const angle = TAU / 8 + (i * TAU) / 4;
    const post = part(new CylinderGeometry(0.05, 0.05, 0.92, 10), brass);
    place(post, [Math.cos(angle) * 0.47, 0.65, Math.sin(angle) * 0.47]);
    group.add(post);
  }
  const roof = part(
    lathe([
      [0.64, 0],
      [0.66, 0.05],
      [0.52, 0.1],
      [0.22, 0.36],
      [0.13, 0.44],
      [0, 0.46],
    ]),
    brass,
  );
  place(roof, [0, 1.1, 0]);
  const finial = part(new SphereGeometry(0.09, 16, 12), brass);
  place(finial, [0, 1.6, 0]);
  const handle = part(new TorusGeometry(0.24, 0.045, 12, 40), kit.blackIron());
  place(handle, [0, 1.86, 0]);
  group.add(roof, finial, handle);
  return group;
}

export function treasureMap() {
  const group = new Group();
  const sheet = new PlaneGeometry(1.4, 1.25, 40, 8);
  const pos = sheet.getAttribute("position");
  for (let i = 0; i < pos.count; i++)
    pos.setZ(i, Math.sin(pos.getX(i) * 4.2) * 0.05 + Math.sin(pos.getY(i) * 3) * 0.02);
  sheet.computeVertexNormals();
  const paper = kit.parchment((ctx, random, w, h) => {
    // Coastline, mountains, a dashed route and the X that marks the spot.
    ctx.strokeStyle = "#5c3816";
    ctx.lineWidth = 12;
    ctx.beginPath();
    for (let a = 0; a <= TAU + 0.01; a += 0.15) {
      const r = w * (0.3 + 0.06 * Math.sin(a * 5 + 1) + 0.03 * Math.sin(a * 11));
      ctx.lineTo(w * 0.47 + Math.cos(a) * r * 1.2, h * 0.5 + Math.sin(a) * r * 0.85);
    }
    ctx.stroke();
    ctx.lineWidth = 10;
    for (const [x, y] of <[number, number][]>[
      [0.32, 0.36],
      [0.42, 0.32],
      [0.37, 0.44],
    ]) {
      ctx.beginPath();
      ctx.moveTo(w * x - 22, h * y + 18);
      ctx.lineTo(w * x, h * y - 18);
      ctx.lineTo(w * x + 22, h * y + 18);
      ctx.stroke();
    }
    ctx.strokeStyle = "#a3201a";
    ctx.lineWidth = 16;
    ctx.setLineDash([30, 20]);
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.7);
    ctx.bezierCurveTo(w * 0.4, h * 0.85, w * 0.5, h * 0.5, w * 0.64, h * 0.6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 30;
    ctx.lineCap = "round";
    const [x, y, s] = [w * 0.72, h * 0.6, w * 0.09];
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.stroke();
    void random;
  });
  paper.side = DoubleSide;
  group.add(part(sheet, paper));
  const roll = kit.parchment(undefined, 9);
  for (const x of [-0.73, 0.73]) {
    const rod = part(new CylinderGeometry(0.1, 0.1, 1.32, 24), roll);
    place(rod, [x, 0, 0.06]);
    const knob = part(new CylinderGeometry(0.05, 0.05, 1.5, 12), kit.oak());
    place(knob, [x, 0, 0.06]);
    group.add(rod, knob);
  }
  place(group, [0, 0, 0], [0, 0, -0.08]);
  return new Group().add(group);
}

export function padlock(open = false) {
  const group = new Group();
  const body = new Shape();
  const [w, h, r] = [0.55, 0.45, 0.22];
  body.moveTo(-w + r, -h);
  body.lineTo(w - r, -h);
  body.quadraticCurveTo(w, -h, w, -h + r);
  body.lineTo(w, h - 0.08);
  body.quadraticCurveTo(w, h, w - 0.08, h);
  body.lineTo(-w + 0.08, h);
  body.quadraticCurveTo(-w, h, -w, h - 0.08);
  body.lineTo(-w, -h + r);
  body.quadraticCurveTo(-w, -h, -w + r, -h);
  const bodyMesh = part(
    new ExtrudeGeometry(body, {
      depth: 0.3,
      bevelEnabled: true,
      bevelSize: 0.06,
      bevelThickness: 0.06,
      bevelSegments: 4,
      curveSegments: 16,
    }),
    kit.verdigris(),
  );
  place(bodyMesh, [0, 0, -0.15]);
  group.add(bodyMesh);

  const keyhole = new Shape();
  keyhole.absarc(0, 0.08, 0.1, 0, TAU, false);
  const slot = new Shape();
  slot.moveTo(-0.05, 0.05);
  slot.lineTo(0.05, 0.05);
  slot.lineTo(0.08, -0.22);
  slot.lineTo(-0.08, -0.22);
  const darkness = new MeshStandardMaterial({ color: 0x120c08, roughness: 0.9 });
  for (const shape of [keyhole, slot]) {
    const mesh = part(new ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }), darkness);
    place(mesh, [0, -0.05, 0.21]);
    group.add(mesh);
  }
  const plate = part(new TorusGeometry(0.2, 0.035, 10, 32), kit.blackIron());
  place(plate, [0, 0.0, 0.21]);
  group.add(plate);

  const iron = kit.iron();
  // Open, the shackle rises out of the body and swings aside.
  const shackle = new Group();
  shackle.add(place(part(new TorusGeometry(0.33, 0.08, 16, 40, Math.PI), iron), [0, 0.72, 0]));
  for (const [x, length] of [
    [-0.33, 0.3],
    [0.33, open ? 0.12 : 0.3],
  ] as const)
    shackle.add(
      place(part(new CylinderGeometry(0.08, 0.08, length, 16), iron), [x, 0.72 - length / 2, 0]),
    );
  if (open) shackle.position.y = 0.3;
  group.add(shackle);
  for (const [x, y] of <[number, number][]>[
    [-0.42, 0.33],
    [0.42, 0.33],
    [-0.42, -0.33],
    [0.42, -0.33],
  ]) {
    const rivet = part(new SphereGeometry(0.045, 12, 8), kit.blackIron());
    place(rivet, [x, y, 0.21]);
    group.add(rivet);
  }
  place(group, [0, 0, 0], [0, 0, 0]);
  return new Group().add(group);
}

export function openBook() {
  const book = new Group();
  const leather = kit.leather("#1f6a3c", 4);
  const pageSurface = (u: number) => 0.04 + 0.13 * Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.6);
  const text = (side: number) =>
    kit.parchment((ctx, random, w, h) => {
      ctx.fillStyle = "rgba(60,40,25,0.75)";
      for (let y = h * 0.12; y < h * 0.88; y += h * 0.07) {
        let x = w * 0.14;
        while (x < w * 0.84) {
          const word = w * (0.04 + random() * 0.1);
          ctx.fillRect(x, y, Math.min(word, w * 0.86 - x), h * 0.022);
          x += word + w * 0.03;
        }
      }
      if (side < 0) {
        ctx.fillStyle = "#a3201a";
        ctx.fillRect(w * 0.14, h * 0.1, w * 0.13, h * 0.14);
      }
    }, 20 + side);
  for (const side of [-1, 1]) {
    const cover = part(new RoundedBoxGeometry(1.02, 0.08, 1.42, 2, 0.03), leather);
    place(cover, [side * 0.5, -0.03, 0], [0, 0, side * 0.08]);
    // The page block: its curved top is the open page.
    const profile = new Shape();
    profile.moveTo(0, 0);
    for (let u = 0; u <= 1.001; u += 0.05) profile.lineTo(u * 0.9, pageSurface(u));
    profile.lineTo(0.9, 0);
    const block = part(
      new ExtrudeGeometry(profile, { depth: 1.24, bevelEnabled: false }),
      kit.parchment(undefined, 30),
    );
    place(block, [0, 0, -0.62]);
    const page = new PlaneGeometry(0.9, 1.24, 24, 1);
    const pos = page.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / 0.9 + 0.5;
      pos.setXYZ(i, u * 0.9, pageSurface(u) + 0.003, -pos.getY(i));
    }
    page.computeVertexNormals();
    const pageMesh = part(page, text(side));
    if (side < 0) {
      // Mirror the left page about the spine, keeping its text readable.
      const uv = page.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    }
    const half = new Group().add(block, pageMesh);
    half.scale.x = side;
    if (side < 0) (pageMesh.material as MeshStandardMaterial).side = DoubleSide;
    book.add(cover, half);
  }
  const ribbon = part(new PlaneGeometry(0.07, 0.5), kit.brass());
  (ribbon.material as MeshPhysicalMaterial).side = DoubleSide;
  place(ribbon, [0.04, 0.05, 0.82], [-Math.PI / 2 + 0.25, 0, 0.1]);
  book.add(ribbon);
  place(book, [0, 0, 0], [1.3, 0, 0]);
  return new Group().add(book);
}

export function cog() {
  const teeth = 10;
  const [outer, root, hole] = [1, 0.8, 0.26];
  const shape = new Shape();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    const step = TAU / teeth;
    const points: [number, number][] = [
      [root, a],
      [outer, a + step * 0.12],
      [outer, a + step * 0.45],
      [root, a + step * 0.57],
    ];
    for (const [r, t] of points) {
      if (i === 0 && r === root && t === a) shape.moveTo(Math.cos(t) * r, Math.sin(t) * r);
      else shape.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    shape.absarc(0, 0, root, a + step * 0.57, a + step, false);
  }
  const centre = new Path();
  centre.absarc(0, 0, hole, 0, TAU, true);
  shape.holes.push(centre);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    const window = new Path();
    window.absarc(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.13, 0, TAU, true);
    shape.holes.push(window);
  }
  const gear = part(
    new ExtrudeGeometry(shape, {
      depth: 0.2,
      bevelEnabled: true,
      bevelSize: 0.035,
      bevelThickness: 0.04,
      bevelSegments: 3,
      curveSegments: 24,
    }),
    kit.steel(),
  );
  place(gear, [0, 0, -0.1]);
  const hub = part(
    lathe([
      [hole, -0.18],
      [0.4, -0.18],
      [0.42, 0.18],
      [hole, 0.18],
      [hole, -0.18],
    ]),
    kit.agedBrass(),
  );
  hub.rotation.x = Math.PI / 2;
  const sapphire = part(new IcosahedronGeometry(0.24, 1), kit.gem(0x2850d8));
  sapphire.scale.z = 0.7;
  place(sapphire, [0, 0, 0.12]);
  const group = new Group().add(gear, hub, sapphire);
  place(group, [0, 0, 0], [0, 0, 0.1]);
  return new Group().add(group);
}

export function dice() {
  const group = new Group();
  // A d20 of old bone with inked numerals, and a red d6 beside it.
  group.add(place(d20(), [0.35, 0, 0.2]));

  const d6 = part(new RoundedBoxGeometry(0.85, 0.85, 0.85, 3, 0.12), kit.brass());
  place(d6, [-0.55, -0.22, -0.35], [0.3, 0.6, 0.1]);
  group.add(d6);
  const pip = kit.lacquer(0x4a1f86);
  const pips: [number, number][] = [
    [-0.22, -0.22],
    [0, 0],
    [0.22, 0.22],
  ];
  for (const [x, y] of pips) {
    const dot = part(new SphereGeometry(0.1, 12, 8), pip);
    dot.scale.z = 0.4;
    place(dot, [x, y, 0.425]);
    d6.add(dot);
  }
  return group;
}

/** A purple d20 with its gilded numeral turned to the viewer. */
export function d20() {
  const group = new Group();
  const die = part(new IcosahedronGeometry(0.75, 0), kit.lacquer(0x5b2a9a));
  die.rotation.set(0.35, 0.5, 0.15);
  group.add(die);
  const numeral = numberDecal(die, "20");
  if (numeral) group.add(numeral);
  return group;
}

/** Ink on the face of `die` that most faces the camera. */
function numberDecal(die: Mesh, label: string): Object3D | undefined {
  die.updateMatrixWorld();
  const geometry = die.geometry as BufferGeometry;
  const pos = geometry.getAttribute("position");
  const toCamera = new Vector3(0, 0.2, 1).normalize();
  let best: { centre: Vector3; normal: Vector3; score: number } | undefined;
  for (let i = 0; i < pos.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) =>
      new Vector3().fromBufferAttribute(pos, i + k).applyMatrix4(die.matrixWorld),
    ) as [Vector3, Vector3, Vector3];
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    const score = normal.dot(toCamera);
    if (!best || score > best.score)
      best = { centre: a.clone().add(b).add(c).divideScalar(3), normal, score };
  }
  if (!best) return undefined;
  const texture = drawnTexture(128, 128, 1, (ctx, _r, w, h) => {
    ctx.fillStyle = "#f2c24e";
    ctx.font = `bold ${h * 0.62}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, w / 2, h * 0.56);
  });
  const decal = new Mesh(
    new PlaneGeometry(0.5, 0.5),
    new MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.6 }),
  );
  decal.position.copy(best.centre).addScaledVector(best.normal, 0.004);
  decal.lookAt(best.centre.clone().add(best.normal));
  return decal;
}

export function archeryTarget() {
  const group = new Group();
  const face = drawnTexture(512, 512, 13, (ctx, random, w, h) => {
    const rings = ["#e8dcc0", "#a3201a", "#e8dcc0", "#a3201a", "#e2b23c"];
    rings.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, (w / 2) * (1 - i / rings.length) * 0.96, 0, TAU);
      ctx.fill();
    });
    // Weathered paint.
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(70,40,15,${random() * 0.12})`;
      ctx.fillRect(random() * w, random() * h, 2 + random() * 8, 1 + random() * 3);
    }
  });
  const wood = kit.oak();
  const board = part(new CylinderGeometry(1, 1, 0.22, 64), [
    wood,
    new MeshStandardMaterial({ map: face, roughness: 0.75 }),
    wood,
  ]);
  board.rotation.x = Math.PI / 2;
  const rim = part(new TorusGeometry(1, 0.06, 12, 64), kit.blackIron());
  place(rim, [0, 0, 0.1]);
  group.add(board, rim);

  // An arrow struck just off the bullseye, angled toward the viewer.
  const arrow = new Group();
  const shaft = part(new CylinderGeometry(0.035, 0.035, 1.3, 10), kit.oak(6));
  place(shaft, [0, 0.65, 0]);
  arrow.add(shaft);
  const fletching = new MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.8, side: DoubleSide });
  for (let i = 0; i < 3; i++) {
    const vane = new Shape();
    vane.moveTo(0, 0);
    vane.lineTo(0.16, 0.08);
    vane.lineTo(0.16, 0.36);
    vane.lineTo(0, 0.3);
    const fin = part(new ExtrudeGeometry(vane, { depth: 0.005, bevelEnabled: false }), fletching);
    place(fin, [0, 1.0, 0], [0, (i * TAU) / 3, 0]);
    arrow.add(fin);
  }
  place(arrow, [0.12, 0.08, 0.1], [Math.PI / 2 - 0.55, 0, -0.7]);
  group.add(arrow);
  place(group, [0, 0, 0], [0, 0, 0]);
  return new Group().add(group);
}
