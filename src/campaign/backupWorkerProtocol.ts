import type { BackupDevice, BackupDoc } from "./backupFormat";

/** What importing a backup did, and what's left for the main thread to merge. */
export interface ImportSummary {
  campaignId: string;
  name: string;
  systemId: string;
  /** A GM's backup: it carries the vault and makes this device a GM. */
  gm: boolean;
  roomKey: string | undefined;
  createdAt: number | undefined;
  exportedBy: string;
  /** Documents open on the main thread, which must merge them into memory. */
  live: BackupDoc[];
}

export type BackupTask =
  /** A backup file of everything stored for the campaign. */
  | { type: "export"; campaignId: string; device: BackupDevice; role: string | undefined }
  /** Merge a backup file into storage, except the `live` (open) documents. */
  | { type: "import"; file: Uint8Array; device: BackupDevice; live: string[] }
  /** The same for a backup folder; it has no campaign if it's new. */
  | {
      type: "mergeFolder";
      dir: FileSystemDirectoryHandle;
      campaignId: string | undefined;
      device: BackupDevice;
      live: string[];
    }
  /** Bring a backup folder up to date with storage, re-reading the documents that changed. */
  | {
      type: "saveFolder";
      dir: FileSystemDirectoryHandle;
      campaignId: string;
      device: BackupDevice;
      role: string | undefined;
      changed: string[] | "all";
    };

export type BackupResult =
  | { type: "export"; file: Uint8Array }
  | { type: "import"; imported: ImportSummary }
  | { type: "mergeFolder"; imported: ImportSummary | null }
  | { type: "saveFolder" };
