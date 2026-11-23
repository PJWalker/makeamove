/* eslint-disable @typescript-eslint/no-magic-numbers */
import type { Matrix4 } from "three";
import { MOTION, STRIDE } from "./splat";

/*
 * Orders a cloud's splats (splat.ts) back to front for a camera, with a
 * counting sort on their depths. A splat that moves on the GPU is sorted by
 * where it spends its time on average rather than where it starts, so smoke
 * that has risen above a wall isn't drawn behind it.
 */

/** How far a splat rises, on average over its motion. */
const RISE = new Map<number, number>([
  [MOTION.flame, 0.17],
  [MOTION.drift, 0.2],
  [MOTION.smoke, 0.9],
]);

/** Where each splat is sorted from: three numbers per splat. */
function sortCentres(data: Float32Array) {
  const count = data.length / STRIDE;
  const centres = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const row = index * STRIDE;
    centres[index * 3] = data[row] ?? 0;
    centres[index * 3 + 1] = (data[row + 1] ?? 0) + (RISE.get(data[row + 16] ?? 0) ?? 0);
    centres[index * 3 + 2] = data[row + 2] ?? 0;
  }
  return centres;
}

/** A sorter for a packed cloud: given a camera's view matrix, the splats' indices, furthest first. */
export function splatSorter(data: Float32Array) {
  const centres = sortCentres(data);
  const count = centres.length / 3;
  const order = new Float32Array(count);
  const depths = new Float32Array(count);
  const buckets = new Uint16Array(count);
  const starts = new Uint32Array(65_536);
  return (view: Matrix4) => {
    const { elements } = view;
    const [ex, ey, ez, ew] = [elements[2], elements[6], elements[10], elements[14]];
    let near = -Infinity;
    let far = Infinity;
    for (let index = 0; index < count; index++) {
      const at = index * 3;
      const depth =
        ex * (centres[at] ?? 0) + ey * (centres[at + 1] ?? 0) + ez * (centres[at + 2] ?? 0) + ew;
      depths[index] = depth;
      if (depth > near) near = depth;
      if (depth < far) far = depth;
    }
    const step = 65_535 / (near - far || 1);
    starts.fill(0);
    for (let index = 0; index < count; index++) {
      const bucket = Math.floor(((depths[index] ?? 0) - far) * step);
      buckets[index] = bucket;
      starts[bucket] = (starts[bucket] ?? 0) + 1;
    }
    let total = 0;
    for (let bucket = 0; bucket < starts.length; bucket++) {
      const size = starts[bucket] ?? 0;
      starts[bucket] = total;
      total += size;
    }
    for (let index = 0; index < count; index++) {
      const bucket = buckets[index] ?? 0;
      const place = starts[bucket] ?? 0;
      starts[bucket] = place + 1;
      order[place] = index;
    }
    return order;
  };
}
