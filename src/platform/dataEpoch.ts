export const DATA_EPOCH = 3;

export const dataName = (kind: string, id?: string) =>
  `mam:v${DATA_EPOCH}:${kind}${id === undefined ? "" : `:${id}`}`;

/** Delete one of this device's IndexedDB databases, named with `dataName`. */
export function deleteData(name: string) {
  indexedDB.deleteDatabase(name);
}
