import type { GameSystem } from './types'
import { dungeonWorld } from './dungeon-world'
import { dnd55e } from './dnd55e'

export const NO_SYSTEM_ID = "none";

const noSystem: GameSystem = {
  id: NO_SYSTEM_ID,
  name: "No system",
  version: "1.0.0",
  stats: [],
  modifier: () => 0,
  baseRoll: "d20",
  results: [],
  result: () => "",
  actions: [],
  actionCategories: [],
  followUps: [],
  classes: [],
  items: [],
  tags: [],
  conditions: [],
  modifiers: [],
  resources: [],
  characterData: [],
  sizes: [],
  scene: { unit: 5, unitName: "ft", diagonal: "euclid" },
  npcFields: [],
  derive: () => ({
    values: {},
    mods: {},
    resolved: { values: {}, why: {}, moves: [], tags: [], bonuses: [] },
  }),
  actionsFor: () => [],
  tokenStats: () => [],
  sheet: { pc: [{ kind: "header" }], npc: [{ kind: "header" }] },
  attribution: "",
};

/*
 * The systems this app knows, by id; a campaign plays one. Built-in systems
 * register here; loading one from a URL or a file is M6.
 */

/** Problems with a system's own data, as sentences; empty when it holds together. */
export function checkSystem(s: GameSystem): string[] {
  const problems: string[] = []
  const unique = (what: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) problems.push(`Two ${what} share the id “${id}”.`)
      seen.add(id)
    }
  }
  unique('stats', s.stats.map((x) => x.id))
  unique('actions', s.actions.map((x) => x.id))
  unique('classes', s.classes.map((x) => x.id))
  unique('items', s.items.map((x) => x.id))
  unique('conditions', s.conditions.map((x) => x.id))
  unique('resources', s.resources.map((x) => x.id))
  unique('character fields', s.characterData.map((x) => x.id))
  unique('sizes', s.sizes.map((x) => x.id))
  for (const z of s.sizes) if (!(z.cells > 0)) problems.push(`${z.name}: a size needs more than 0 cells.`)

  const stats = new Set(s.stats.map((x) => x.id))
  const categories = new Set(s.actionCategories.map((x) => x.id))
  const classes = new Set(s.classes.map((x) => x.id))
  const followUps = new Set(s.followUps.map((x) => x.id))
  const fields = new Set(s.characterData.map((x) => x.id))
  for (const a of s.actions) {
    if (!categories.has(a.category)) problems.push(`${a.name}: no action category “${a.category}”.`)
    if (a.classId && !classes.has(a.classId)) problems.push(`${a.name}: no class “${a.classId}”.`)
    for (const step of a.steps) {
      if (step.kind === 'save') {
        if (!s.actions.some((x) => x.id === step.action)) problems.push(`${a.name}: no action “${step.action}” to save with.`)
        continue
      }
      if (step.stat && !stats.has(step.stat)) problems.push(`${a.name}: no stat “${step.stat}”.`)
      for (const r of s.results) if (!(r.id in step.outcomes)) problems.push(`${a.name}: no outcome for “${r.label}”.`)
      for (const ids of Object.values(step.followUps ?? {}))
        for (const f of ids) if (!followUps.has(f)) problems.push(`${a.name}: no follow-up “${f}”.`)
    }
  }
  for (const a of s.actions) for (const f of a.followUps ?? []) if (!followUps.has(f)) problems.push(`${a.name}: no follow-up “${f}”.`)
  for (const k of s.conditions) if (k.stat && !stats.has(k.stat)) problems.push(`${k.name}: no stat “${k.stat}”.`)
  for (const f of s.followUps) if (f.kind === 'bump' && !fields.has(f.field)) problems.push(`${f.label}: no character field “${f.field}”.`)
  return problems
}

const SYSTEMS = new Map<string, GameSystem>()

/** Add a system, after checking that its data holds together. */
export function defineSystem(system: GameSystem): GameSystem {
  const problems = checkSystem(system)
  if (problems.length) throw new Error(`${system.name} has problems:\n${problems.join('\n')}`)
  SYSTEMS.set(system.id, system)
  return system
}

defineSystem(dungeonWorld)
defineSystem(dnd55e)
defineSystem(noSystem);

/** The system with this id; Dungeon World for campaigns that don't say. */
export function getSystem(id: string | undefined): GameSystem {
  return (id && SYSTEMS.get(id)) || dungeonWorld
}

/** Every system this app knows. */
export const listSystems = () => [...SYSTEMS.values()]
