import type * as React from "react";
import { createContext, use, useEffect, useState } from "react";
import { loadBlob, type PeerBlobs } from "../media/images";
import type { BlobRef } from "../media/images";

/** Where images missing from this device come from: the open campaign's peers. */
export const PeerBlobsContext = createContext<PeerBlobs | null>(null);

/** An image from the blob store, or `fallback` while it's missing from this device. */
export function BlobImage({
  image,
  alt = "",
  className: cls,
  fallback,
}: {
  image?: BlobRef | undefined;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  // Keyed by what was loaded, so a new image or retry never shows a stale URL.
  const [loaded, setLoaded] = useState<{ hash: string; tries: number; url: string } | null>(null);
  const [tries, setTries] = useState(0);
  const hash = image?.hash;
  const peers = use(PeerBlobsContext);

  useEffect(() => peers?.onAvailable(() => setTries((n) => n + 1)), [peers]);
  useEffect(() => {
    if (!hash) return;
    let made: string | null = null;
    let stale = false;
    void loadBlob(hash, peers).then((blob) => {
      if (stale || !blob) return;
      made = URL.createObjectURL(blob);
      setLoaded({ hash, tries, url: made });
    });
    return () => {
      stale = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [hash, tries, peers]);

  const url = loaded && loaded.hash === hash && loaded.tries === tries ? loaded.url : null;
  return url ? <img className={cls} src={url} alt={alt} draggable={false} /> : <>{fallback}</>;
}
