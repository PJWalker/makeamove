import * as Y from "yjs";

/*
 * A keyed collection inside a campaign's system data: one nested Y.Map
 * under a single key, created on the first write. Reads never create it,
 * so looking something up doesn't change the document.
 */

export interface SystemStore<T> {
  get(key: string): T | undefined;
  has(key: string): boolean;
  set(key: string, value: T): void;
  delete(key: string): void;
  values(): T[];
}

/** The store kept under `name` in this system data. */
export function systemStore<T>(systemData: Y.Map<unknown>, name: string): SystemStore<T> {
  const read = (): Y.Map<T> | undefined => {
    const map = systemData.get(name);
    return map instanceof Y.Map ? (map as Y.Map<T>) : undefined;
  };
  const write = (): Y.Map<T> => {
    let map = read();
    if (!map) {
      map = new Y.Map<T>();
      systemData.set(name, map);
    }
    return map;
  };
  return {
    get: (key) => read()?.get(key),
    has: (key) => !!read()?.has(key),
    set: (key, value) => write().set(key, value),
    delete: (key) => read()?.delete(key),
    values: () => [...(read()?.values() ?? [])],
  };
}

/** One key for a pair of ids, the same whichever comes first. */
export const pairKey = (first: string, second: string): string => [first, second].sort().join(":");
