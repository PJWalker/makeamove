import { workerClient } from "../lib/workerRpc";
import type { BackupResult, BackupTask } from "./backupWorkerProtocol";

/** Run a task in the backup worker (see backupTasks.ts). */
const runInBackupWorker = workerClient<BackupTask, BackupResult>(
  () => new Worker(new URL("backup.worker.ts", import.meta.url), { type: "module" }),
  "Backup worker",
);

export default runInBackupWorker;
