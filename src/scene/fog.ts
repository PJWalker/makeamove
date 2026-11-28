/*
 * Fog of war: what a player can see of a scene, place by place. A scene's
 * fog is off, revealed automatically by where its characters have been and
 * what they see, or revealed by hand by the GM. Either way the GM can draw
 * shapes that force a place revealed or hidden, and a hidden shape wins over
 * everything: no exploring, sight or revealed shape shows what's under it.
 *
 * The renderer paints the fog as a run of passes (fogPasses), each covering
 * or clearing some places; that run is proved to leave exactly the revealed
 * places clear.
 */

export type FogMode = "auto" | "manual" | "none";

export const FOG_MODES: { id: FogMode; label: string; title: string }[] = [
  { id: "none", label: "Off", title: "Players see the whole scene" },
  { id: "auto", label: "Explore", title: "Characters reveal what they see as they move" },
  { id: "manual", label: "By hand", title: "Only shapes the GM reveals show" },
];

/** What lies over one place on the scene. */
export interface FogCover {
  /** Inside a shape the GM hid. */
  hidden: boolean;
  /** Inside a shape the GM revealed. */
  revealed: boolean;
  /** Seen by a character before. */
  explored: boolean;
  /** In sight of the viewer's tokens now. */
  inSight: boolean;
}

/** Whether a place shows through the fog: a hidden shape wins, then a revealed one, then (exploring) what's been or is being seen. */
export function isRevealed(mode: FogMode, c: FogCover): boolean {
  //@ verify
  //@ ensures mode === "none" ==> \result
  //@ ensures mode !== "none" && c.hidden ==> !\result
  //@ ensures mode !== "none" && !c.hidden && c.revealed ==> \result
  //@ ensures mode === "manual" ==> \result === (!c.hidden && c.revealed)
  //@ ensures mode === "auto" ==> \result === (!c.hidden && (c.revealed || c.explored || c.inSight))
  if (mode === "none") return true;
  if (c.hidden) return false;
  return c.revealed || (mode === "auto" && (c.explored || c.inSight));
}

/**
 * One pass of painting the fog: cover everything, clear what's been
 * explored, what's in sight or what the GM revealed, or cover what the GM hid.
 */
export type FogPass = "clearExplored" | "clearRevealed" | "clearSight" | "cover" | "coverHidden";

/** The passes that paint a scene's fog, bottom to top. */
export function fogPasses(mode: FogMode): FogPass[] {
  //@ verify
  if (mode === "none") return [];
  if (mode === "manual") return ["cover", "clearRevealed", "coverHidden"];
  return ["cover", "clearExplored", "clearSight", "clearRevealed", "coverHidden"];
}

/** Whether a place is clear of fog after a pass, from whether it was before. */
export function afterPass(pass: FogPass, clear: boolean, c: FogCover): boolean {
  //@ verify
  if (pass === "cover") return false;
  if (pass === "clearExplored") return clear || c.explored;
  if (pass === "clearSight") return clear || c.inSight;
  if (pass === "clearRevealed") return clear || c.revealed;
  return clear && !c.hidden;
}

/** Whether a place is clear of fog after a run of passes, starting clear. */
export function afterPasses(passes: FogPass[], c: FogCover): boolean {
  //@ verify
  //@ decreases passes.length
  if (passes.length === 0) return true;
  // LemmaScript doesn't model `.at()`.
  // eslint-disable-next-line unicorn/prefer-at
  const last = passes[passes.length - 1]!;
  return afterPass(last, afterPasses(passes.slice(0, -1), c), c);
}

/**
 * Painting a scene's passes leaves exactly its revealed places clear.
 * @public A proof, not called.
 */
export function paintedClear(mode: FogMode, c: FogCover): boolean {
  //@ verify
  //@ ensures \result === isRevealed(mode, c)
  return afterPasses(fogPasses(mode), c);
}

/**
 * How a place looks to a player: clear; remembered (revealed, but out of
 * their tokens' sight, so shown dimmed and without anyone in it); or unseen.
 * `vision` is whether they see only what their tokens see.
 */
export type FogShade = "clear" | "remembered" | "unseen";

export function fogShade(mode: FogMode, vision: boolean, c: FogCover): FogShade {
  //@ verify
  //@ ensures \result === "clear" ==> isRevealed(mode, c) && (!vision || c.inSight)
  //@ ensures \result === "remembered" ==> isRevealed(mode, c) && mode !== "none"
  //@ ensures mode !== "none" && c.hidden ==> \result === "unseen"
  //@ ensures !vision && isRevealed(mode, c) ==> \result === "clear"
  if (!isRevealed(mode, c)) return "unseen";
  if (vision && !c.inSight) return mode === "none" ? "unseen" : "remembered";
  return "clear";
}

/**
 * What the scene is painted in, bottom to top: its element layers (see
 * types.ts LAYERS), with the grid, light, sight and fog between them.
 * Only the layer above the fog is ever seen over it.
 */
export type Stratum =
  | "aboveFog"
  | "fog"
  | "grid"
  | "light"
  | "map"
  | "over"
  | "sight"
  | "tint"
  | "token"
  | "under";

/** The element layers, the strata elements sit in. */
export type ElementLayer = "aboveFog" | "map" | "over" | "token" | "under";

/** The order the strata are painted in, bottom to top. */
export function stack(): Stratum[] {
  //@ verify
  return ["map", "grid", "under", "token", "over", "tint", "light", "sight", "fog", "aboveFog"];
}

/** Where a stratum is painted: higher is on top. */
export function height(s: Stratum): number {
  //@ verify
  //@ ensures 0 <= \result && \result < 10
  //@ ensures stack()[\result] === s
  if (s === "map") return 0;
  if (s === "grid") return 1;
  if (s === "under") return 2;
  if (s === "token") return 3;
  if (s === "over") return 4;
  if (s === "tint") return 5;
  if (s === "light") return 6;
  if (s === "sight") return 7;
  if (s === "fog") return 8;
  return 9;
}

/** The stratum an element layer is painted in. */
export function stratumOf(layer: ElementLayer): Stratum {
  //@ verify
  if (layer === "map") return "map";
  if (layer === "under") return "under";
  if (layer === "token") return "token";
  if (layer === "over") return "over";
  return "aboveFog";
}

/** Whether an element in `layer` is painted over the fog. */
export function overFog(layer: ElementLayer): boolean {
  //@ verify
  //@ ensures \result === (layer === "aboveFog")
  return height(stratumOf(layer)) > height("fog");
}

/**
 * Whether a player sees an element in `layer` at a place with `shade`:
 * fog hides it, unless it's painted over the fog.
 * @public A proof, not called.
 */
export function elementSeen(layer: ElementLayer, shade: FogShade): boolean {
  //@ verify
  //@ ensures layer === "aboveFog" ==> \result
  //@ ensures layer !== "aboveFog" && shade === "unseen" ==> !\result
  //@ ensures shade !== "unseen" ==> \result
  return shade !== "unseen" || overFog(layer);
}
