import * as Y from "yjs";
import { store, type Store } from "../lib/store";
import { canWrite, pickFolder } from "../platform/files";
import { deleteValue, readValue, writeValue } from "../platform/keyval";
import { finishImport, openGuids, roleIn, thisDevice } from "./backup";
import { runInBackupWorker } from "./backupWorker";
import { BackupFileError } from "./backupFormat";
import type { Campaign } from "./campaign";

/*
 * A live backup: a folder on disk that holds the campaign, kept up to date
 * while it's open. Pick a folder another app syncs (Dropbox, iCloud Drive) and
 * the campaign survives this device. The folder holds
 *
 *   campaign.makeamove  the backup file, without images
 *   images/<hash>       each image, written once (they never change)
 *
 * Linking a folder that already holds this campaign merges it in first, and
 * a campaign can be imported from such a folder on another device.
 *
 * Browsers forget folder access between visits unless the user allowed it
 * for good, so after a reload the backup may wait for a click to resume.
 *
 * This side only notes which documents change; the backup worker reads them
 * from storage and writes the folder (see backupTasks.ts).
 */

/** How long after the last change the folder is brought up to date. Tests shorten it. */
export const folderSaveDelay = { ms: 3000 };

const handleKey = (campaignId: string) => `backupFolder:${campaignId}`;

export type FolderBackupState =
  | { state: "off" }
  /** Linked, but the browser needs the user's say-so again. */
  | { state: "paused"; folder: string }
  | { state: "saving"; folder: string; savedAt?: number }
  | { state: "saved"; folder: string; savedAt: number }
  | { state: "failed"; folder: string; error: string };

class FolderSync {
  /** Documents changed since the last save; all of them until the first. */
  private dirty = new Set<string>();
  private everything = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> | null = null;
  private again = false;
  private stops: (() => void)[] = [];
  private stopped = false;

  constructor(
    private readonly campaign: Campaign,
    private readonly dir: FileSystemDirectoryHandle,
    private readonly status: Store<FolderBackupState>,
  ) {}

  start() {
    this.watchDoc(this.campaign.doc);
    const onVault = () => {
      const v = this.campaign.vault.value;
      if (v) this.watchDoc(v.doc);
    };
    onVault();
    this.stops.push(this.campaign.vault.subscribe(onVault));
    // Leaving the tab may be the last chance to save.
    if (typeof document !== "undefined") {
      const onHide = () => {
        if (document.visibilityState === "hidden") this.flush();
      };
      document.addEventListener("visibilitychange", onHide);
      this.stops.push(() => document.removeEventListener("visibilitychange", onHide));
    }
    void this.save();
  }

  /** Mark a document dirty on each change, and its subdocuments as they load. */
  private watchDoc(doc: Y.Doc) {
    const watchOne = (d: Y.Doc) => {
      const onUpdate = () => this.changed(d.guid);
      d.on("update", onUpdate);
      this.stops.push(() => d.off("update", onUpdate));
    };
    watchOne(doc);
    for (const sub of doc.getSubdocs()) if (sub.shouldLoad) watchOne(sub);
    const onSubdocs = ({ loaded }: { loaded: Set<Y.Doc> }) => {
      for (const sub of loaded) watchOne(sub);
    };
    doc.on("subdocs", onSubdocs);
    this.stops.push(() => doc.off("subdocs", onSubdocs));
  }

  private changed(guid: string) {
    this.dirty.add(guid);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), folderSaveDelay.ms);
  }

  /** Save now if anything is waiting. */
  flush() {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    void this.save();
  }

  private async save(): Promise<void> {
    this.timer = undefined;
    if (this.saving) {
      this.again = true;
      return this.saving;
    }
    const folder = this.dir.name;
    const last = this.status.value;
    this.status.value = {
      state: "saving",
      folder,
      ...("savedAt" in last && { savedAt: last.savedAt }),
    };
    this.saving = this.write()
      .then(() => {
        if (!this.stopped) this.status.value = { state: "saved", folder, savedAt: Date.now() };
      })
      .catch((e: unknown) => {
        if (this.stopped) return;
        // Permission can lapse while open; wait for a click.
        const lost = e instanceof DOMException && e.name === "NotAllowedError";
        this.status.value = lost
          ? { state: "paused", folder }
          : { state: "failed", folder, error: e instanceof Error ? e.message : String(e) };
      })
      .finally(() => {
        this.saving = null;
        if (this.again && !this.stopped) {
          this.again = false;
          void this.save();
        }
      });
    return this.saving;
  }

  private async write() {
    const dirty = this.dirty;
    const everything = this.everything;
    this.dirty = new Set();
    this.everything = false;
    try {
      await runInBackupWorker({
        type: "saveFolder",
        dir: this.dir,
        campaignId: this.campaign.id,
        device: thisDevice(),
        role: roleIn(this.campaign.id),
        changed: everything ? "all" : [...dirty],
      });
    } catch (e) {
      for (const guid of dirty) this.dirty.add(guid);
      this.everything ||= everything;
      throw e;
    }
  }

  stop() {
    this.flush();
    this.stopped = true;
    clearTimeout(this.timer);
    for (const stop of this.stops) stop();
    this.stops = [];
  }
}

/** Merge a campaign folder's contents into this device. Returns the campaign id, or null if it has none. */
async function mergeFolder(dir: FileSystemDirectoryHandle, campaignId?: string) {
  const { imported } = await runInBackupWorker({
    type: "mergeFolder",
    dir,
    campaignId,
    device: thisDevice(),
    live: openGuids(),
  });
  return imported && finishImport(imported);
}

/**
 * A campaign's backup to a folder on this device: kept up to date while the
 * campaign is open, once it's linked. One per open campaign; `dispose` stops it.
 */
export class FolderBackup {
  readonly status = store<FolderBackupState>({ state: "off" });
  #running: FolderSync | null = null;
  #disposed = false;

  /** Start backing up to the campaign's linked folder, if it has one. */
  constructor(private readonly campaign: Campaign) {
    void (async () => {
      const dir = await readValue<FileSystemDirectoryHandle>(handleKey(campaign.id));
      if (this.#disposed || !dir) return;
      if (await canWrite(dir)) {
        if (!this.#disposed) this.#begin(dir);
      } else if (!this.#disposed) this.status.value = { state: "paused", folder: dir.name };
    })();
  }

  #begin(dir: FileSystemDirectoryHandle) {
    this.#running?.stop();
    this.#running = new FolderSync(this.campaign, dir, this.status);
    this.#running.start();
  }

  #stop() {
    this.#running?.stop();
    this.#running = null;
    this.status.value = { state: "off" };
  }

  /** Choose a folder and start backing the campaign up to it. False if the user cancels. */
  async link(): Promise<boolean> {
    const id = this.campaign.id;
    const dir = await pickFolder(`backup-${id}`);
    if (!dir) return false;
    await mergeFolder(dir, id);
    await writeValue(handleKey(id), dir);
    this.#begin(dir);
    return true;
  }

  /** Ask again for access to the linked folder (needs a click), and carry on. */
  async resume() {
    const dir = await readValue<FileSystemDirectoryHandle>(handleKey(this.campaign.id));
    if (dir && (await canWrite(dir, true))) this.#begin(dir);
  }

  async unlink() {
    this.#stop();
    await deleteValue(handleKey(this.campaign.id));
  }

  /** Save what's waiting and stop. */
  dispose() {
    this.#disposed = true;
    this.#stop();
  }
}

/**
 * Import a campaign from a backup folder, and keep backing it up there.
 * Returns its id, or null if the user cancels.
 */
export async function importFromFolder(): Promise<string | null> {
  const dir = await pickFolder();
  if (!dir) return null;
  const id = await mergeFolder(dir);
  if (!id) throw new BackupFileError("That folder has no campaign in it.");
  await writeValue(handleKey(id), dir);
  return id;
}
