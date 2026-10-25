import type { GameSystem } from './types'
import { dungeonWorld } from './dungeon-world'

/** Built-in systems, by id. One system per campaign. */
const SYSTEMS: Record<string, GameSystem> = {
  [dungeonWorld.id]: dungeonWorld,
}

export function getSystem(id: string | undefined): GameSystem {
  return (id && SYSTEMS[id]) || dungeonWorld
}
