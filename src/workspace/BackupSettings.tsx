import { useState } from "react";
import { exportBackupFile } from "../campaign/backup";
import type { Campaign } from "../campaign/campaign";
import {
  folderBackup,
  linkBackupFolder,
  resumeFolderBackup,
  unlinkBackupFolder,
  type FolderBackupState,
} from "../campaign/folderBackup";
import { canUseFolders } from "../platform/files";
import { Button } from "../ui/Button";
import { IconBackupFolder, IconExport } from "../ui/icons";
import { useValue } from "../ui/useValue";

const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

function folderStatus(s: FolderBackupState): string {
  switch (s.state) {
    case "off":
      return "Not backing up to a folder.";
    case "paused":
      return `Paused. ${s.folder} needs permission again.`;
    case "saving":
      return `Saving to ${s.folder}…`;
    case "saved":
      return `Saved to ${s.folder} at ${time.format(s.savedAt)}.`;
    case "failed":
      return `Couldn't save to ${s.folder}: ${s.error}`;
  }
}

/** Saving the campaign off this device: a one-off file, or a folder kept up to date. */
export function BackupSettings({ campaign }: { campaign: Campaign }) {
  const status = useValue(folderBackup);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (act: () => Promise<unknown>) => async () => {
    setError(null);
    setBusy(true);
    try {
      await act();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dialog-section form-layout">
      <h3 className="dialog-heading form-title">Backup</h3>
      <div className="dialog-subsection form-subsection">
        <h4 className="dialog-subheading form-subheading">Backup file</h4>
        <div className="field">
          <span className="muted">
            Everything this device has of the campaign
            {campaign.isGm() ? ", GM-only pages included," : ""} with its images.
          </span>
          <div className="form-row">
            <Button
              disabled={busy}
              onClick={() => void run(() => exportBackupFile(campaign.id, campaign.name))()}
            >
              <IconExport size={20} /> Export Backup…
            </Button>
          </div>
        </div>
      </div>
      {canUseFolders() && (
        <div className="dialog-subsection form-subsection">
          <h4 className="dialog-subheading form-subheading">Backup folder</h4>
          <div className="field">
            <span className="muted" aria-live="polite">
              {folderStatus(status)}
            </span>
            <div className="form-row">
              {status.state === "paused" && (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void run(() => resumeFolderBackup(campaign))()}
                >
                  Resume
                </Button>
              )}
              {(status.state === "off" || status.state === "failed") && (
                <Button
                  disabled={busy}
                  onClick={() => void run(() => linkBackupFolder(campaign))()}
                >
                  <IconBackupFolder size={20} /> Back Up to Folder…
                </Button>
              )}
              {status.state !== "off" && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(() => unlinkBackupFolder(campaign))()}
                >
                  Stop Backing Up
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
