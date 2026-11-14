/**
 * Observable values for ephemeral state that lives outside React and isn't
 * persisted: a scene's selection, what a drag is over, the route. Anything
 * kept between visits lives in a Yjs document (shared, or the campaign's
 * local one). Reading `.value` returns the current value and never
 * subscribes; components read through `useQuery`,
 * and non-React code reacts with `watch`. Every dependency is explicit, so
 * React Compiler can memoize components that read these.
 */

type Listener = () => void;

export interface ReadonlyStore<T> {
  readonly value: T;
  /** Bumped whenever `value` changes; derived stores compare it to skip recomputing. */
  readonly version: number;
  /** Call `listener` after each change. Returns the unsubscribe function. */
  readonly subscribe: (listener: Listener) => () => void;
}

let batchDepth = 0;
const pending = new Set<Listener>();

function notify(listeners: Iterable<Listener>) {
  if (batchDepth > 0) {
    for (const l of listeners) pending.add(l);
    return;
  }
  for (const listener of Array.from(listeners)) listener();
}

/** Run `fn`, holding notifications until it returns so listeners see one change. */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && pending.size) {
      const queued = [...pending];
      pending.clear();
      for (const l of queued) l();
    }
  }
}

export class Store<T> implements ReadonlyStore<T> {
  #value: T;
  #version = 0;
  readonly #listeners = new Set<Listener>();

  constructor(initial: T) {
    this.#value = initial;
  }

  get value(): T {
    return this.#value;
  }

  /** Setting an equal value (Object.is) changes nothing and notifies no one. */
  set value(next: T) {
    if (Object.is(next, this.#value)) return;
    this.#value = next;
    this.#version++;
    notify(this.#listeners);
  }

  get version(): number {
    return this.#version;
  }

  /** The same as setting `value`, as a call: what components use, since React Compiler won't let them assign. */
  readonly set = (next: T) => {
    this.value = next;
  };

  readonly subscribe = (listener: Listener) => {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  };
}

export function store<T>(initial: T): Store<T> {
  return new Store(initial);
}

class Derived<T> implements ReadonlyStore<T> {
  #value!: T;
  #version = 0;
  #seen: number[] | null = null;

  constructor(
    private readonly sources: readonly ReadonlyStore<unknown>[],
    private readonly compute: () => T,
  ) {}

  #refresh() {
    const versions = this.sources.map((s) => s.version);
    if (
      this.#seen &&
      versions.length === this.#seen.length &&
      versions.every((v, i) => v === this.#seen![i])
    )
      return;
    this.#seen = versions;
    const next = this.compute();
    if (this.#version > 0 && Object.is(next, this.#value)) return;
    this.#value = next;
    this.#version++;
  }

  get value(): T {
    this.#refresh();
    return this.#value;
  }

  get version(): number {
    this.#refresh();
    return this.#version;
  }

  readonly subscribe = (listener: Listener) => {
    const stops = this.sources.map((s) => s.subscribe(listener));
    return () => stops.forEach((stop) => stop());
  };
}

/**
 * A value computed from `sources`. It recomputes lazily, only when one of
 * them has changed, so `compute` must read nothing else that changes.
 */
export function derived<T>(
  sources: readonly ReadonlyStore<unknown>[],
  compute: () => T,
): ReadonlyStore<T> {
  return new Derived(sources, compute);
}

/** Run `fn` now and after each change to any of `sources`. Returns the stop function. */
export function watch(sources: readonly ReadonlyStore<unknown>[], fn: () => void): () => void {
  fn();
  const stops = sources.map((s) => s.subscribe(fn));
  return () => stops.forEach((stop) => stop());
}
