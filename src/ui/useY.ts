import { useEffect, useEffectEvent, useReducer, useRef } from "react";
import type * as Y from "yjs";

/**
 * Subscribe a component to a Yjs type. `read` derives a plain value from it;
 * the component re-renders when that Y type (or anything inside it) changes
 * and `read` gives something new. Values compare with Object.is, so reads
 * that return strings, numbers or booleans (or JSON) skip renders for changes
 * that don't touch them: a chat card doesn't redraw when another card does.
 *
 * `read` runs on every render rather than being cached, so a value that also
 * depends on props or state (such as "does element `id` exist?") is never
 * stale when only the prop changes. Yjs types are mutable, so this hook opts
 * out of React Compiler: memoizing `read()` on its identity would miss edits.
 */
export function useY<T, EventType>(
  type: Y.AbstractType<EventType> | null | undefined,
  read: () => T,
): T {
  "use no memo";
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const latest = useRef(read);
  latest.current = read;
  const value = read();
  const shown = useRef(value);
  shown.current = value;
  const bump = useEffectEvent(() => {
    if (!Object.is(latest.current(), shown.current)) rerender();
  });

  useEffect(() => {
    if (!type) return;
    const onChange = () => bump();
    type.observeDeep(onChange);
    onChange();
    return () => type.unobserveDeep(onChange);
  }, [type]);

  return value;
}
