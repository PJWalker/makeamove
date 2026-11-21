import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { isObject, type Guard } from "../lib/guards";
import { collection, lww, rootOf } from "./schema";
import { store, type ReadonlyStore, type Store } from "../lib/store";

/*
 * A Yjs document that stays on this device: persisted to IndexedDB and never
 * synced. It holds a campaign's UI state on this device, such as where its
 * panels are, which windows are open, the tools' settings and recent actions.
 * Each value sits under its own key in the `ui` map as plain JSON; nothing
 * else edits it, so there is nothing to merge.
 */

/** One value in a local document. Setting `value` (or calling `set`) writes it through. */
export interface LocalValue<T> extends ReadonlyStore<T> {
  value: T;
  readonly set: (next: T) => void;
}

export class LocalDoc {
  readonly doc = new Y.Doc();
  /** Each value as stored; `value` reads it into shape. */
  readonly ui = rootOf(this.doc, { ui: collection(lww<unknown>()) }).ui;
  readonly #persistence: IndexeddbPersistence | null;
  readonly #stops: (() => void)[] = [];

  private constructor(databaseName: string | null) {
    this.#persistence = databaseName === null ? null : new IndexeddbPersistence(databaseName, this.doc);
  }

  static async open(databaseName: string): Promise<LocalDoc> {
    const d = new LocalDoc(databaseName);
    await d.#persistence!.whenSynced;
    return d;
  }

  /** A local document kept only in memory, for tests. */
  static inMemory(): LocalDoc {
    return new LocalDoc(null);
  }

  /**
   * The value stored under `key`. `read` turns what's stored into a value,
   * given undefined when nothing is; it should log once and fall back when
   * what's stored can't be used, leaving the stored data as it is.
   */
  value<T>(key: string, read: (stored: unknown) => T): LocalValue<T> {
    const mirror: Store<T> = store(read(this.ui.get(key)));
    // Writes made here are already in the mirror; only stored state loading in needs reading.
    const onChange = (e: Y.YMapEvent<unknown>) => {
      if (!e.transaction.local && e.keysChanged.has(key)) mirror.value = read(this.ui.get(key));
    };
    this.ui.y.observe(onChange);
    this.#stops.push(() => this.ui.y.unobserve(onChange));
    const write = (next: T) => {
      if (Object.is(next, mirror.value)) return;
      mirror.value = next;
      this.ui.set(key, next);
    };
    return {
      get value() {
        return mirror.value;
      },
      set value(next: T) {
        write(next);
      },
      set: write,
      get version() {
        return mirror.version;
      },
      subscribe: mirror.subscribe,
    };
  }

  destroy() {
    for (const stop of this.#stops.splice(0)) stop();
    void this.#persistence?.destroy();
    this.doc.destroy();
  }
}

/** Read a stored object of settings over its defaults, keeping only the keys the defaults have. */
export function settingsOver<T extends object>(defaults: T, name: string) {
  return (stored: unknown): T => {
    if (stored === undefined) return defaults;
    if (!isObject<Partial<T>>(stored)) {
      console.warn(`Ignoring stored ${name}: not an object`, stored);
      return defaults;
    }
    const out = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof T)[]) {
      const v = stored[k];
      if (v !== undefined && typeof v === typeof defaults[k]) out[k] = v;
    }
    return out;
  };
}

/** Read a stored list, leaving out the items that aren't a T. */
export function listOf<T>(is: Guard<T>, name: string, fallback: T[] = []) {
  return (stored: unknown): T[] => {
    if (stored === undefined) return fallback;
    if (!Array.isArray(stored)) {
      console.warn(`Ignoring stored ${name}: not a list`, stored);
      return fallback;
    }
    const items = stored.filter(is);
    if (items.length < stored.length)
      console.warn(
        `Leaving out stored ${name} that can't be read`,
        stored.filter((v) => !is(v)),
      );
    return items;
  };
}

/** Read one of `options` as stored, or `fallback`. */
export function choiceOf<const T extends string>(options: readonly T[], fallback: T, name: string) {
  return (stored: unknown): T => {
    if (stored === undefined) return fallback;
    if (options.includes(stored as T)) return stored as T;
    console.warn(`Ignoring stored ${name}: unknown`, stored);
    return fallback;
  };
}
