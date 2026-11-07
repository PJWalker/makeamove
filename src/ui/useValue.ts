import { useSyncExternalStore } from "react";
import type { ReadonlyStore } from "../lib/store";

const noSubscribe = () => () => {};

/** Read a store and re-render when it changes. A missing store reads as undefined. */
export function useValue<T>(store: ReadonlyStore<T>): T;
export function useValue<T>(store: ReadonlyStore<T> | null | undefined): T | undefined;
export function useValue<T>(store: ReadonlyStore<T> | null | undefined): T | undefined {
  return useSyncExternalStore(store?.subscribe ?? noSubscribe, () => store?.value);
}
