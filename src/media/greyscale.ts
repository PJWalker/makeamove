/*
 * An image's brightness, for analysing what it shows (its grid, its
 * walls). Read in a worker, from a decoded bitmap.
 */

/** Brightness 0–1 per pixel, row by row, `scale` image px to each pixel. */
export interface Greyscale {
  width: number;
  height: number;
  /** How many of the image's own px each pixel here covers. */
  scale: number;
  data: Float32Array;
}

const RED = 0.299;
const GREEN = 0.587;
const BLUE = 0.114;
const CHANNEL_MAX = 255;
const CHANNELS = 4;
/** Where blue is among a pixel's channels. */
const BLUE_AT = 2;

/** `bitmap`'s brightness, shrunk if need be so its longer side is at most `maxSide` px. */
export function greyscale(bitmap: ImageBitmap, maxSide: number): Greyscale {
  const scale = Math.max(1, Math.max(bitmap.width, bitmap.height) / maxSide);
  const width = Math.max(1, Math.round(bitmap.width / scale));
  const height = Math.max(1, Math.round(bitmap.height / scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create image analysis canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const data = new Float32Array(width * height);
  for (let index = 0; index < data.length; index++) {
    const at = index * CHANNELS;
    data[index] =
      (RED * rgba[at]! + GREEN * rgba[at + 1]! + BLUE * rgba[at + BLUE_AT]!) / CHANNEL_MAX;
  }
  return { width, height, scale: bitmap.width / width, data };
}
