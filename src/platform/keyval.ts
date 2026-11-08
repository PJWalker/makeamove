import { dataName } from "./dataEpoch";

/*
 * Values kept on this device only, in one IndexedDB object store. They are
 * stored by structured clone, so plain objects and arrays need no encoding.
 */

const STORE = "values";
let opened: Promise<IDBDatabase> | null = null;

function database() {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(dataName("keyval"), 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opened = null;
      reject(request.error ?? new Error("Couldn't open on-device storage"));
    };
  });
  return opened;
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const request = act(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("On-device storage failed"));
  });
}

export async function readValue<T>(key: string): Promise<T | undefined> {
  return (await run("readonly", (s) => s.get(key))) as T | undefined;
}

export async function writeValue(key: string, value: unknown): Promise<void> {
  await run("readwrite", (s) => s.put(value, key));
}

export async function deleteValue(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
}
