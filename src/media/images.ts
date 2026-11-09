import { getBlob, putBlob } from "../platform/blobs";
import { workerClient } from "../lib/workerRpc";
import type { ImageWorkerResult, ImageWorkerTask } from "./imageWorkerProtocol";
import type { BlobRef } from "../core/blob";

const runImageTask = workerClient<ImageWorkerTask, ImageWorkerResult>(
  () => new Worker(new URL("./images.worker.ts", import.meta.url), { type: "module" }),
  "Image worker",
  // A decoded image nobody wants any more still holds GPU memory.
  (result) => {
    if (result.type === "decode") result.bitmap.close();
  },
);

/**
 * Import an image file: decode it, cap its size, re-encode it as WebP and
 * store it by hash. Only the returned reference goes into the CRDT.
 */
export async function importImage(file: Blob): Promise<BlobRef> {
  const { blob, width, height, colour } = await runImageTask({
    type: "import",
    blob: file,
  });
  const hash = await putBlob(blob);
  colours.set(hash, colour);
  return { hash, mime: blob.type, width, height };
}

type BlobFetcher = (hash: string) => Promise<Blob | null>;
let fetchFromPeers: BlobFetcher | null = null;

/** Set (or clear) how to get images this device lacks, e.g. from other players. */
export function setBlobFetcher(fn: BlobFetcher | null, onlyIfCurrent?: BlobFetcher) {
  if (onlyIfCurrent && fetchFromPeers !== onlyIfCurrent) return;
  fetchFromPeers = fn;
  if (fn) for (const l of fetcherListeners) l();
}

const fetcherListeners = new Set<() => void>();

/** Be told when peers become available to fetch from, so missing images can retry. */
export function onBlobFetcher(fn: () => void) {
  fetcherListeners.add(fn);
  return () => fetcherListeners.delete(fn);
}

/** A stored image's bytes, from this device or else from peers; null if neither has it. */
export async function loadBlob(hash: string): Promise<Blob | null> {
  return (await getBlob(hash)) ?? (await fetchFromPeers?.(hash)) ?? null;
}

const bitmaps = new Map<string, Promise<ImageBitmap | null>>();

/** Decode a stored image once and share it; null if this device lacks it. */
export function loadBitmap(hash: string): Promise<ImageBitmap | null> {
  let p = bitmaps.get(hash);
  if (!p) {
    p = getBlob(hash)
      .then((blob) => blob ?? fetchFromPeers?.(hash) ?? null)
      .then(async (blob) => (blob ? (await runImageTask({ type: "decode", blob })).bitmap : null));
    bitmaps.set(hash, p);
    // A miss isn't final: a peer may have it later.
    void p.then((b) => b || bitmaps.delete(hash));
  }
  return p;
}

/**
 * Drop every decoded image. Destroying a texture closes its bitmap, so the
 * renderer calls this when it frees its textures.
 */
export function forgetBitmaps() {
  bitmaps.clear();
}

const colours = new Map<string, string>();

/** Dominant colour of a stored image, sampled from a 64 × 64 thumbnail. */
export async function imageColour(hash: string): Promise<string | null> {
  const known = colours.get(hash);
  if (known) return known;
  const blob = await loadBlob(hash);
  if (!blob) return null;
  const { colour } = await runImageTask({ type: "colour", blob });
  colours.set(hash, colour);
  return colour;
}
