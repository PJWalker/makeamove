import { serveWorker } from "../../lib/workerRpc";
import { simulateDice } from "./physics";
import type { DiceResult, DiceTask } from "./simulation";

serveWorker<DiceTask, DiceResult>((task) =>
  Promise.resolve(
    task.type === "warm"
      ? { type: "warm" }
      : { type: "roll", frames: simulateDice(task.tray, task.throws) },
  ),
);
