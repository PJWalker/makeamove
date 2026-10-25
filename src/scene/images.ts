import { dominantColour } from '../lib/colour'
import { getBlob, putBlob } from '../store/blobs'
import type { BlobRef } from './types'

/** Longest side of an imported image; bigger ones are scaled down. */
export const MAX_IMAGE_SIZE = 8192

/**
 * Import an image file: decode it, cap its size, re-encode it as WebP and
 * store it by hash. Only the returned reference goes into the CRDT.
 */
export async function importImage(file: Blob): Promise<BlobRef> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(width, height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  // Browsers that can't encode WebP hand back PNG; blob.type says which.
  const encoded = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 })
  const hash = await putBlob(encoded)
  return { hash, mime: encoded.type, width, height }
}

type BlobFetcher = (hash: string) => Promise<Blob | null>
let fetchFromPeers: BlobFetcher | null = null

/** Set (or clear) how to get images this device lacks, e.g. from other players. */
export function setBlobFetcher(fn: BlobFetcher | null, onlyIfCurrent?: BlobFetcher) {
  if (onlyIfCurrent && fetchFromPeers !== onlyIfCurrent) return
  fetchFromPeers = fn
  if (fn) for (const l of fetcherListeners) l()
}

const fetcherListeners = new Set<() => void>()

/** Be told when peers become available to fetch from, so missing images can retry. */
export function onBlobFetcher(fn: () => void) {
  fetcherListeners.add(fn)
  return () => fetcherListeners.delete(fn)
}

/** A stored image's bytes, from this device or else from peers; null if neither has it. */
export async function loadBlob(hash: string): Promise<Blob | null> {
  return (await getBlob(hash)) ?? (await fetchFromPeers?.(hash)) ?? null
}

const bitmaps = new Map<string, Promise<ImageBitmap | null>>()

/** Decode a stored image once and share it; null if this device lacks it. */
export function loadBitmap(hash: string): Promise<ImageBitmap | null> {
  let p = bitmaps.get(hash)
  if (!p) {
    p = getBlob(hash)
      .then((blob) => blob ?? fetchFromPeers?.(hash) ?? null)
      .then((blob) => (blob ? createImageBitmap(blob) : null))
    bitmaps.set(hash, p)
    // A miss isn't final: a peer may have it later.
    p.then((b) => b || bitmaps.delete(hash))
  }
  return p
}

/**
 * Drop every decoded image. Destroying a texture closes its bitmap, so the
 * renderer calls this when it frees its textures.
 */
export function forgetBitmaps() {
  bitmaps.clear()
}

const colours = new Map<string, string>()

/** Dominant colour of a stored image, sampled from a 64 × 64 thumbnail. */
export async function imageColour(hash: string): Promise<string | null> {
  const known = colours.get(hash)
  if (known) return known
  const bitmap = await loadBitmap(hash)
  if (!bitmap) return null
  const canvas = new OffscreenCanvas(64, 64)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, 64, 64)
  const colour = dominantColour(ctx.getImageData(0, 0, 64, 64).data)
  colours.set(hash, colour)
  return colour
}
