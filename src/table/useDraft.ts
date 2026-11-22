import { useState } from "react";

/** A form's draft, and a way to change some of its fields. */
export function useDraft<T extends object>(initial: T | (() => T)) {
  const [draft, setDraft] = useState(initial);
  const patch = (changes: Partial<T>) => { setDraft((now) => ({ ...now, ...changes })); };
  return [draft, patch] as const;
}
