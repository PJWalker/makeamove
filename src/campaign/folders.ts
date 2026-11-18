/*
 * Folders that scenes, characters and notes are filed in. Each kind keeps its
 * folders in a collection of its own; these work on any of them.
 */

/** The name a folder starts with, until someone names it. */
export const UNTITLED_FOLDER = "Untitled folder";

export interface FolderView {
  id: string;
  name: string;
}

interface Folders<F extends { name: string }> {
  entries(): [string, F][];
  get(id: string): F | undefined;
  set(id: string, folder: F): void;
}

/** Something that can be filed in a folder. */
interface Filed {
  get(key: "folder"): string | undefined;
  delete(key: "folder"): void;
}

/** What a folder is called when it's given `name`: untitled if that's blank. */
export const folderName = (name: string) => name.trim() || UNTITLED_FOLDER;

/** Every folder, by name. */
export function foldersByName(folders: Folders<{ name: string }>): FolderView[] {
  return folders
    .entries()
    .map(([id, f]) => ({ id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Rename a folder; a blank name changes nothing. */
export function renameFolderIn<F extends { name: string }>(
  folders: Folders<F>,
  id: string,
  name: string,
) {
  const folder = folders.get(id);
  const trimmed = name.trim();
  if (folder && trimmed) folders.set(id, { ...folder, name: trimmed });
}

/** File everything in a folder back at the top level. */
export function unfile(items: Iterable<Filed>, folderId: string) {
  for (const item of items) if (item.get("folder") === folderId) item.delete("folder");
}
