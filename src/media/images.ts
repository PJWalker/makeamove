import { getBlob, putBlob } from "../platform/blobs";
import { workerClient } from "../lib/workerRpc";
import type { ImageWorkerResult, ImageWorkerTask } from "./imageWorkerProtocol";

/** An image in the blob store; the CRDT holds only this reference. */
export interface BlobRef {
  hash: string;
  mime: string;
  width: number;
  height: number;
}

/** What an entity (a character, an item, a move) is pictured as: an image, or a built-in icon. */
export type EntityGraphic = { kind: "icon"; name: string } | { kind: "image"; image: BlobRef };

/** The entity a token's graphic comes from. */
export interface EntityGraphicRef {
  kind: string;
  id: string;
}

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

/** Where a campaign gets images this device lacks: from other players, while connected. */
export class PeerBlobs {
  #fetch: ((hash: string) => Promise<Blob | null>) | null = null;
  readonly #listeners = new Set<() => void>();

  /** Set (or clear) how to reach peers; their arrival tells listeners to retry missing images. */
  connect(fetch: ((hash: string) => Promise<Blob | null>) | null) {
    this.#fetch = fetch;
    if (fetch) for (const listener of Array.from(this.#listeners)) listener();
  }

  fetch(hash: string): Promise<Blob | null> {
    return this.#fetch?.(hash) ?? Promise.resolve(null);
  }

  /** Be told when peers become available to fetch from, so missing images can retry. */
  onAvailable(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => void this.#listeners.delete(fn);
  }
}

/** A stored image's bytes, from this device or else from `peers`; null if neither has it. */
export async function loadBlob(hash: string, peers?: PeerBlobs | null): Promise<Blob | null> {
  return (await getBlob(hash)) ?? (await peers?.fetch(hash)) ?? null;
}

const bitmaps = new Map<string, Promise<ImageBitmap | null>>();

/** Decode a stored image once and share it; null if this device lacks it. */
export function loadBitmap(hash: string, peers?: PeerBlobs | null): Promise<ImageBitmap | null> {
  let p = bitmaps.get(hash);
  if (!p) {
    p = loadBlob(hash, peers).then(async (blob) =>
      blob ? (await runImageTask({ type: "decode", blob })).bitmap : null,
    );
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
export async function imageColour(hash: string, peers?: PeerBlobs | null): Promise<string | null> {
  const known = colours.get(hash);
  if (known) return known;
  const blob = await loadBlob(hash, peers);
  if (!blob) return null;
  const { colour } = await runImageTask({ type: "colour", blob });
  colours.set(hash, colour);
  return colour;
}
