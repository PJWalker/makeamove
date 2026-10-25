import { useEffect, useState } from 'preact/hooks'
import { loadBlob, onBlobFetcher } from '../scene/images'
import type { BlobRef } from '../scene/types'

/** An image from the blob store, or `fallback` while it's missing from this device. */
export function BlobImage({ image, alt = '', class: cls, fallback }: { image?: BlobRef; alt?: string; class?: string; fallback?: preact.ComponentChildren }) {
  const [url, setUrl] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const hash = image?.hash

  useEffect(() => onBlobFetcher(() => setTries((n) => n + 1)), [])
  useEffect(() => {
    setUrl(null)
    if (!hash) return
    let made: string | null = null
    let stale = false
    loadBlob(hash).then((blob) => {
      if (stale || !blob) return
      made = URL.createObjectURL(blob)
      setUrl(made)
    })
    return () => {
      stale = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [hash, tries])

  return url ? <img class={cls} src={url} alt={alt} draggable={false} /> : <>{fallback}</>
}
