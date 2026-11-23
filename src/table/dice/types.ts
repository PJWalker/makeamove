import type { Quaternion } from "three/webgpu";

/* What the rest of the app knows of the 3D dice, without loading them. */

export interface Point {
  x: number;
  y: number;
}

/**
 * What a die looks like: a solid of `sides` faces ("die"), or a flat round chip
 * ("chip") that shows the same face on both sides and flicks through its faces
 * while it rolls. Face `index` reads `label(index)` (lines split by \n put a
 * caption over the main line); it shows face `shown`. `colour` is any CSS
 * colour, read where the die's slot sits in the page.
 */
export interface DieLook {
  form: "chip" | "die";
  sides: number;
  label: (index: number) => string;
  shown: number;
  colour: string;
}

/** Where a moving die is, in viewport px, how high it's lifted off the table, and how it's turned. */
export interface Pose {
  x: number;
  y: number;
  lift: number;
  rotation: Quaternion;
}

/**
 * A motion: where the die is `ms` after the motion began. Once `done`, the die
 * lies at rest in its slot, turned as the motion's last pose.
 */
export type Track = (ms: number) => { pose: Pose; done: boolean };
