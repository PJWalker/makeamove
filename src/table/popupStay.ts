import { useEffect, useState } from "react";

/*
 * How long chat popups and speech bubbles stay over the table
 * (ChatPopups.tsx, SpeechBubbles.tsx).
 */

/** How long a popup stays, once the pointer isn't on it. */
export const STAY_MS = 6000;

/** Whether the page is hidden (a background tab); popups wait, to be read on coming back. */
export function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(document.visibilityState === "hidden");
  useEffect(() => {
    const onVisibility = () => {
      setHidden(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return hidden;
}
