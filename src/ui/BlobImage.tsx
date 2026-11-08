import type * as React from "react";
import { useEffect, useState } from "react";
import { loadBlob, onBlobFetcher } from "../scene/images";
import type { BlobRef } from "../scene/types";

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

  useEffect(() => {
    const unsubscribe = onBlobFetcher(() => setTries((n) => n + 1));
    return () => {
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!hash) return;
    let made: string | null = null;
    let stale = false;
    void loadBlob(hash).then((blob) => {
      if (stale || !blob) return;
      made = URL.createObjectURL(blob);
      setLoaded({ hash, tries, url: made });
    });
    return () => {
      stale = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [hash, tries]);

  const url = loaded && loaded.hash === hash && loaded.tries === tries ? loaded.url : null;
  return url ? <img className={cls} src={url} alt={alt} draggable={false} /> : <>{fallback}</>;
}
