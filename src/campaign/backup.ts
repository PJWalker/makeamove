import * as Y from "yjs";
import { device } from "../platform/device";
import { openFile, saveFile } from "../platform/files";
import { BACKUP_FILE, backupFileName, claimGm, type BackupDevice } from "./backupFormat";
import { runInBackupWorker } from "./backupWorker";
import type { ImportSummary } from "./backupWorkerProtocol";
import { openCampaigns, type Campaign } from "./campaign";
import { summaryOf, upsertCampaign } from "./registry";

/*
 * Campaign backups, from the main thread. The work (reading every stored
 * document, finding images, encoding, compressing, merging) happens in the
 * backup worker; this side keeps the campaign list and merges into the
 * documents open here. See backupFormat.ts for what a backup holds.
 */

export const thisDevice = (): BackupDevice => ({ id: device.value.id, name: device.value.name });

/** This device's role in a campaign, as far as it knows without opening it. */
export const roleIn = (campaignId: string): string | undefined => {
  const open = openOne(campaignId);
  if (open) return open.isGm() ? "gm" : "player";
  return summaryOf(campaignId)?.role;
};

const openOne = (campaignId: string): Campaign | undefined =>
  [...openCampaigns].find((c) => c.id === campaignId);

/** The campaign's documents open in memory right now, by guid. */
function liveDocs(campaignId: string): Map<string, Y.Doc> {
  const live = new Map<string, Y.Doc>();
  const campaign = openOne(campaignId);
  if (!campaign) return live;
  const add = (doc: Y.Doc) => {
    live.set(doc.guid, doc);
    // `shouldLoad` is what load() sets; Yjs sets `isLoaded` only once a provider says so.
    for (const sub of doc.getSubdocs()) if (sub.shouldLoad) live.set(sub.guid, sub);
  };
  add(campaign.doc);
  const vault = campaign.vault.value;
  if (vault) add(vault.doc);
  return live;
}

/**
 * The open documents a merge must leave to the main thread. A backup names
 * its campaign inside, so this lists every open one; only its campaign's match.
 */
export const openGuids = () => [...openCampaigns].flatMap((c) => [...liveDocs(c.id).keys()]);

/**
 * Finish an import the worker has merged into storage: merge what's open
 * here, and add the campaign to the list if it's new on this device.
 */
export function finishImport(imported: ImportSummary): string {
  const { campaignId, gm } = imported;
  const live = liveDocs(campaignId);
  for (const doc of imported.live) {
    const open = live.get(doc.guid);
    if (!open) continue;
    Y.applyUpdate(open, doc.update);
    if (doc.kind === "campaign" && gm) claimGm(open, thisDevice(), imported.exportedBy);
  }
  if (!summaryOf(campaignId)) {
    const now = Date.now();
    upsertCampaign({
      id: campaignId,
      name: imported.name,
      systemId: imported.systemId,
      role: gm ? "gm" : "player",
      ...(imported.roomKey && { roomKey: imported.roomKey }),
      createdAt: imported.createdAt ?? now,
      lastOpenedAt: now,
    });
  }
  return campaignId;
}

/** A backup file of everything this device has of the campaign, images included. */
export async function backUpCampaign(campaignId: string): Promise<Uint8Array> {
  const { file } = await runInBackupWorker({
    type: "export",
    campaignId,
    device: thisDevice(),
    role: roleIn(campaignId),
  });
  return file;
}

/** Merge a backup file into this device. Returns the campaign id. */
export async function importBackup(file: Uint8Array): Promise<string> {
  const { imported } = await runInBackupWorker(
    { type: "import", file, device: thisDevice(), live: openGuids() },
    [file.buffer],
  );
  return finishImport(imported);
}

/** Save a backup of the campaign to a file the user picks. False if they cancel. */
export function exportBackupFile(campaignId: string, name: string): Promise<boolean> {
  return saveFile(backupFileName(name), () => backUpCampaign(campaignId), BACKUP_FILE);
}

/** Import a backup file the user picks. Returns the campaign id, or null if they cancel. */
export async function importBackupFile(): Promise<string | null> {
  const file = await openFile(BACKUP_FILE);
  if (!file) return null;
  return importBackup(new Uint8Array(await file.arrayBuffer()));
}
