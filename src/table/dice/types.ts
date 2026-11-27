import type { Quaternion } from "three";

/* What the rest of the app knows of the 3D dice, without loading them. */

export interface Point {
  x: number;
  y: number;
}

/**
 * What a die looks like: a die of `sides` showing `value`, or a flat round chip
 * with `chip` on both faces (lines split by \n). `colour` is any CSS colour,
 * read where the die's slot sits in the page.
 */
export type DieLook = { chip: string; colour: string } | { sides: number; value: number; colour: string };

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
