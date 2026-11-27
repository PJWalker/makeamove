import { checkSystem, listSystems } from "../src/systems/index.ts";

const problems = listSystems().flatMap((system) =>
  checkSystem(system).map((problem) => `${system.id}: ${problem}`),
);

if (problems.length > 0) {
  throw new Error(`System data problems:\n${problems.join("\n")}`);
}

console.log(`Verified ${String(listSystems().length)} registered systems.`);
