/*
 * Files and folders on the user's disk, through the File System API. Saving
 * and opening single files works everywhere (falling back to a download and a
 * file input); folders need showDirectoryPicker, which only Chromium has.
 *
 * The pickers and permission calls are not in TypeScript's DOM library yet,
 * so their shapes are declared here.
 */

type Permission = "granted" | "denied" | "prompt";

interface PermissionTarget {
  queryPermission?(options: { mode: "readwrite" }): Promise<Permission>;
  requestPermission?(options: { mode: "readwrite" }): Promise<Permission>;
}

interface FilePickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface Pickers {
  showDirectoryPicker?(options: {
    id?: string;
    mode: "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
  showSaveFilePicker?(options: {
    suggestedName: string;
    types: FilePickerType[];
  }): Promise<FileSystemFileHandle>;
}

const pickers = (): Pickers => (typeof window === "undefined" ? {} : (window as Pickers));

/** A file type for the pickers: what it's called and its extension, with the dot. */
export interface FileKind {
  description: string;
  extension: string;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Whether this browser can keep a folder on disk up to date. */
export const canUseFolders = (): boolean => !!pickers().showDirectoryPicker;

/** Ask for a folder to read and write. Null if the user cancels. */
export async function pickFolder(id?: string): Promise<FileSystemDirectoryHandle | null> {
  const p = pickers();
  if (!p.showDirectoryPicker) return null;
  try {
    return await p.showDirectoryPicker({ ...(id && { id }), mode: "readwrite" });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/**
 * Whether we may still write to a folder. With `ask`, prompt for access if it
 * has lapsed (as it does between visits); that needs a click to be allowed.
 */
export async function canWrite(dir: FileSystemDirectoryHandle, ask = false): Promise<boolean> {
  const target = dir as FileSystemDirectoryHandle & PermissionTarget;
  const options = { mode: "readwrite" } as const;
  if ((await target.queryPermission?.(options)) === "granted") return true;
  if (!ask || !target.requestPermission) return !target.queryPermission;
  return (await target.requestPermission(options)) === "granted";
}

/**
 * Save a file, letting the user choose where when the browser allows it.
 * The picker opens before `contents` runs, while the click still counts.
 * False if the user cancels.
 */
export async function saveFile(
  name: string,
  contents: () => Promise<Uint8Array>,
  kind: FileKind,
): Promise<boolean> {
  const toBlob = async () =>
    new Blob([(await contents()) as Uint8Array<ArrayBuffer>], {
      type: "application/octet-stream",
    });
  const p = pickers();
  if (p.showSaveFilePicker) {
    let file;
    try {
      file = await p.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: kind.description,
            accept: { "application/octet-stream": [kind.extension] },
          },
        ],
      });
    } catch (e) {
      if (isAbort(e)) return false;
      throw e;
    }
    const blob = await toBlob();
    const w = await file.createWritable();
    await w.write(blob);
    await w.close();
    return true;
  }
  const url = URL.createObjectURL(await toBlob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Ask for one file to open. Null if the user cancels. */
export function openFile(kind: FileKind): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind.extension;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export async function readFileIn(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<File | null> {
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

/** Write a file in a folder. The old contents stay until the new ones are all written. */
export async function writeFileIn(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: Blob | Uint8Array,
): Promise<void> {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(data instanceof Blob ? data : (data as Uint8Array<ArrayBuffer>));
  await w.close();
}

/** The names of the files directly in a folder. */
export async function fileNamesIn(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind === "file") names.push(name);
  }
  return names;
}
