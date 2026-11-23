import { serveWorker } from "../lib/workerRpc";
import { brushAtlas } from "./brushAtlas";
import { buildCave } from "./caveScene";
import type { CaveResult, CaveTask } from "./caveWorker";
import { pack } from "./splat";

serveWorker<CaveTask, CaveResult>(
  ({ seed }) => {
    const cave = buildCave(seed);
    return Promise.resolve({
      type: "build",
      splats: pack(cave.splats),
      lights: cave.lights,
      brushes: brushAtlas(),
    });
  },
  ({ splats, brushes }) => [splats.buffer, brushes.buffer],
);
