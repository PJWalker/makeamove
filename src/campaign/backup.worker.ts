import { serveWorker } from "../lib/workerRpc";
import { runBackupTask } from "./backupTasks";
import type { BackupResult, BackupTask } from "./backupWorkerProtocol";

serveWorker<BackupTask, BackupResult>(runBackupTask, (result) =>
  result.type === "export" ? [result.file.buffer] : [],
);
