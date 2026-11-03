import type { TokenStyle } from "../../scene/types"
import type { Effect, EffectActive } from "../../systems/effectTypes"
import type { DataValue } from "../../core/types"

export type CharacterKind = "pc" | "npc"
export type Naming = "number" | "list" | "adjective"

export interface TemplateSettings {
  naming: Naming
  names: string[]
}

export interface ItemInstance {
  id: string
  defId?: string
  name: string
  description: string
  weight: number
  tags: string[]
  uses?: number
  usesLeft?: number
  equippable?: boolean
  equipped: boolean
  icon?: string
  effects: Effect[]
  active: EffectActive
  order: string
}

export interface CharacterView {
  id: string
  kind: CharacterKind
  folder?: string
  name: string
  owner: string
  scores: Record<string, number>
  data: Record<string, DataValue>
  resources: Record<string, number>
  conditions: string[]
  lockedConditions?: string[]
  durations: Record<string, Duration>
  concentration?: string
  modifiers: Record<string, number>
  fields: Record<string, string | number>
  inventory: ItemInstance[]
  tokenStyle?: TokenStyle
  tokenColour?: string
  template?: TemplateSettings
  base?: string
  learned: string[]
}

export interface Duration {
  rounds: number
  tick: "start" | "end"
  of: string
}