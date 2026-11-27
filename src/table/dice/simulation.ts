import { workerClient } from "../../lib/workerRpc";
import type { DiePose, DieThrow, DieTray } from "./physics";

/*
 * Rolls are worked out in a worker: a busy roll takes tens of milliseconds
 * of physics, which on the main thread would stall the page as the dice fly.
 */

export type DiceTask = { type: "roll"; tray: DieTray; throws: DieThrow[] } | { type: "warm" };
export type DiceResult = { type: "roll"; frames: DiePose[][] } | { type: "warm" };

const run = workerClient<DiceTask, DiceResult>(
  () => new Worker(new URL("dice.worker.ts", import.meta.url), { type: "module" }),
  "Dice worker",
);

let warmed = false;

/** Start the worker before the first roll, so that roll doesn't wait for it to load. */
export async function warmDice() {
  if (warmed) return;
  warmed = true;
  try {
    await run({ type: "warm" });
  } catch (error) {
    console.error("The dice worker couldn't start.", error);
  }
}

/** Every frame of a roll, per die, as `simulateDice` gives them. */
export async function simulateDiceInWorker(
  tray: DieTray,
  throws: DieThrow[],
): Promise<DiePose[][]> {
  const { frames } = await run({ type: "roll", tray, throws });
  return frames;
}
