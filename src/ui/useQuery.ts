import { useRef, useSyncExternalStore } from "react";
import type { ReadonlyStore } from "../lib/store";

/*
 * One hook for reading changing state in components: a typed handle on the
 * shared campaign document or the device-local one, or a store.
 */

type Listener = () => void;

interface YObservable {
  observeDeep(listener: Listener): void;
  unobserveDeep(listener: Listener): void;
}

/** Anything `useQuery` can read: something that counts its changes and says when it changes. */
interface Source {
  readonly version: number;
  readonly subscribe: (listener: Listener) => () => void;
}

/** Counts a Yjs type's deep changes, observing it only while someone listens. */
class YSource implements Source {
  version = 0;
  readonly #listeners = new Set<Listener>();
  readonly #type: YObservable;

  constructor(type: YObservable) {
    this.#type = type;
  }

  readonly #onChange = () => {
    this.version++;
    for (const listener of this.#listeners) listener();
  };

  readonly subscribe = (listener: Listener) => {
    if (this.#listeners.size === 0) this.#type.observeDeep(this.#onChange);
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#type.unobserveDeep(this.#onChange);
    };
  };
}

const ySources = new WeakMap<YObservable, YSource>();

function isStore(reference: object): reference is ReadonlyStore<unknown> {
  return "subscribe" in reference && "version" in reference;
}

function sourceOf(reference: Queryable | null | undefined): Source | null {
  if (!reference) return null;
  if (isStore(reference)) return reference;
  const type = "y" in reference ? reference.y : reference;
  let s = ySources.get(type);
  if (!s) ySources.set(type, (s = new YSource(type)));
  return s;
}

/** A typed handle from data/ (or the Yjs type behind one), or a store. */
export type Queryable = ReadonlyStore<unknown> | YObservable | { readonly y: YObservable };

const noSubscribe = () => () => {};

/** Read a store, re-rendering when it changes. A missing store reads as undefined. */
export function useQuery<T>(reference: ReadonlyStore<T>): T;
export function useQuery<T>(reference: ReadonlyStore<T> | null | undefined): T | undefined;
/**
 * Read `select(ref)`, re-rendering when `ref` (or anything inside it) changes
 * and `select` gives something new. Values compare with Object.is, so reads
 * that return strings, numbers or booleans (or JSON) skip renders for changes
 * that don't touch them: a chat card doesn't redraw when another card does.
 *
 * `select` runs again on every render, so a value that also depends on properties
 * or state is never stale when only they change. Yjs types are mutable, so
 * this hook opts out of React Compiler: memoizing on their identity would
 * miss edits. A missing `ref` never changes; `select` still runs.
 */
export function useQuery<R extends Queryable, T>(
  reference: R | null | undefined,
  select: (reference: R) => T,
): T;
export function useQuery<R extends Queryable, T>(
  reference: R | null | undefined,
  select?: (reference_: R) => T,
): T | undefined {
  "use no memo";
  const source = sourceOf(reference);
  const read = select ?? ((r: R | null | undefined) => (r as ReadonlyStore<T> | null)?.value);
  const cache = useRef<{ version: number; read: typeof read; value: T | undefined } | null>(null);
  const snapshot = () => {
    const version = source?.version ?? 0;
    const c = cache.current;
    if (c?.version === version && c.read === read) return c.value;
    const next = read(reference!);
    const value = c && Object.is(c.value, next) ? c.value : next;
    cache.current = { version, read, value };
    return value;
  };
  return useSyncExternalStore(source?.subscribe ?? noSubscribe, snapshot, snapshot);
}
