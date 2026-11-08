import { putBlob } from "../platform/blobs";
import { fileNamesIn, readFileIn, writeFileIn } from "../platform/files";
import { getBlob } from "../platform/blobs";
import {
  assembleBackup,
  BackupFileError,
  claimGm,
  decodeBackup,
  encodeBackup,
  isGmBackup,
  mergeStoredDoc,
  metaOf,
  readBlobs,
  snapshotCampaign,
  type CampaignBackup,
  type BackupDevice,
  type DocSnapshot,
} from "./backupFormat";
import type { BackupResult, BackupTask, ImportSummary } from "./backupWorkerProtocol";

/*
 * The backup worker's tasks. Everything here reads and writes storage
 * directly, so it can run off the main thread; documents open there are
 * passed back for it to merge.
 *
 * A backup folder holds
 *   campaign.makeamove  the backup file, without images
 *   images/<hash>       each image, written once (they never change)
 */

export const CAMPAIGN_FILE = "campaign.makeamove";
const IMAGES = "images";

/** Merge a backup into storage, leaving the documents open on the main thread to it. */
async function importBackup(
  backup: CampaignBackup,
  device: BackupDevice,
  live: string[],
): Promise<ImportSummary> {
  const gm = isGmBackup(backup);
  for (const blob of backup.blobs)
    await putBlob(new Blob([blob.data as Uint8Array<ArrayBuffer>], { type: blob.type }));
  const open = new Set(live);
  for (const doc of backup.docs) {
    if (open.has(doc.guid)) continue;
    await mergeStoredDoc(
      doc,
      doc.kind === "campaign" && gm
        ? (root) => claimGm(root, device, backup.exportedBy)
        : undefined,
    );
  }
  const { roomKey, createdAt } = metaOf(backup.docs, backup.campaignId);
  return {
    campaignId: backup.campaignId,
    name: backup.name,
    systemId: backup.systemId,
    gm,
    roomKey,
    createdAt,
    exportedBy: backup.exportedBy,
    live: backup.docs.filter((d) => open.has(d.guid)),
  };
}

async function mergeFolder(
  dir: FileSystemDirectoryHandle,
  campaignId: string | undefined,
  device: BackupDevice,
  live: string[],
): Promise<ImportSummary | null> {
  const file = await readFileIn(dir, CAMPAIGN_FILE);
  if (!file) return null;
  const backup = await decodeBackup(new Uint8Array(await file.arrayBuffer()));
  if (campaignId && backup.campaignId !== campaignId)
    throw new BackupFileError(`That folder holds another campaign, ${backup.name}.`);
  let images: FileSystemDirectoryHandle | null = null;
  try {
    images = await dir.getDirectoryHandle(IMAGES);
  } catch {
    // A folder without images yet.
  }
  if (images)
    for (const name of await fileNamesIn(images)) {
      const blob = await readFileIn(images, name);
      if (blob) await putBlob(blob);
    }
  return importBackup(backup, device, live);
}

/** What a folder's last save left there, so the next only re-reads what changed. */
interface FolderState {
  snapshots: Map<string, DocSnapshot>;
  /** Images already in the folder. */
  onDisk: Set<string>;
}
const folders = new Map<string, FolderState>();

async function saveFolder(task: Extract<BackupTask, { type: "saveFolder" }>) {
  const { dir, campaignId, device, role, changed } = task;
  let state = folders.get(campaignId);
  const fresh = !state || changed === "all";
  if (!state || fresh)
    folders.set(campaignId, (state = { snapshots: new Map(), onDisk: new Set() }));
  const stale = new Set(changed === "all" ? [] : changed);
  const known = state.snapshots;
  const docs = await snapshotCampaign(campaignId, device, role, (guid) =>
    stale.has(guid) ? undefined : known.get(guid),
  );
  state.snapshots = new Map(docs.map((d) => [d.guid, d]));
  await writeFileIn(
    dir,
    CAMPAIGN_FILE,
    await encodeBackup(assembleBackup(campaignId, device, docs, [])),
  );

  const images = await dir.getDirectoryHandle(IMAGES, { create: true });
  if (fresh) for (const name of await fileNamesIn(images)) state.onDisk.add(name);
  for (const hash of new Set(docs.flatMap((d) => [...d.hashes]))) {
    if (state.onDisk.has(hash)) continue;
    // Not here yet (a peer still has to send it); it's tried again next save.
    const blob = await getBlob(hash);
    if (!blob) continue;
    await writeFileIn(images, hash, blob);
    state.onDisk.add(hash);
  }
}

export async function runBackupTask(task: BackupTask): Promise<BackupResult> {
  switch (task.type) {
    case "export": {
      const docs = await snapshotCampaign(task.campaignId, task.device, task.role);
      const blobs = await readBlobs(new Set(docs.flatMap((d) => [...d.hashes])));
      const backup = assembleBackup(task.campaignId, task.device, docs, blobs);
      return { type: "export", file: await encodeBackup(backup) };
    }
    case "import":
      return {
        type: "import",
        imported: await importBackup(await decodeBackup(task.file), task.device, task.live),
      };
    case "mergeFolder":
      return {
        type: "mergeFolder",
        imported: await mergeFolder(task.dir, task.campaignId, task.device, task.live),
      };
    case "saveFolder":
      await saveFolder(task);
      return { type: "saveFolder" };
  }
}
