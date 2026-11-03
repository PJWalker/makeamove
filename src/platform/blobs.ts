/*
 * Content-addressed blob store for images. Blobs live in the Origin Private
 * File System under blobs/<sha-256>, so the same image dropped twice (or into
 * two campaigns) is stored once. Browsers without writable OPFS files fall
 * back to Cache Storage. In M2, peers fetch blobs they lack from each other
 * by hash.
 */

const DIR = 'blobs'
const CACHE = 'mam-blobs'

let dirPromise: Promise<FileSystemDirectoryHandle | null> | null = null

function blobDir(): Promise<FileSystemDirectoryHandle | null> {
  dirPromise ??= (async () => {
    try {
      const root = await navigator.storage.getDirectory()
      const dir = await root.getDirectoryHandle(DIR, { create: true })
      // Safari before 18 can read OPFS files but not write them from the page.
      return 'createWritable' in FileSystemFileHandle.prototype ? dir : null
    } catch {
      return null
    }
  })()
  return dirPromise
}

const cacheKey = (hash: string) => `/blobs/${hash}`

export async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Store a blob and return its hash. Storing the same bytes twice is a no-op. */
export async function putBlob(blob: Blob): Promise<string> {
  const hash = await sha256(await blob.arrayBuffer())
  // Ask once to be exempt from eviction; maps are worth keeping.
  navigator.storage.persist?.().catch(() => {})
  const dir = await blobDir()
  if (dir) {
    const file = await dir.getFileHandle(hash, { create: true })
    if ((await file.getFile()).size !== blob.size) {
      const w = await file.createWritable()
      await w.write(blob)
      await w.close()
    }
  } else {
    const cache = await caches.open(CACHE)
    await cache.put(cacheKey(hash), new Response(blob, { headers: { 'content-type': blob.type } }))
  }
  return hash
}

export async function getBlob(hash: string): Promise<Blob | null> {
  const dir = await blobDir()
  if (dir) {
    try {
      const file = await (await dir.getFileHandle(hash)).getFile()
      return file.size ? file : null
    } catch {
      return null
    }
  }
  const res = await (await caches.open(CACHE)).match(cacheKey(hash))
  return res ? res.blob() : null
}
