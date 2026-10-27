import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import type { EntryIconName } from '../ui/entryIcons'

/*
 * A player's own touches on actions: what a hotbar slot is called and shows,
 * and keyboard shortcuts. Kept in the player's member entry, like the hotbar
 * itself, so they follow the player between devices and touch no one else's.
 */

export interface SlotLook {
  label?: string
  icon?: EntryIconName
}

const LOOKS = 'hotbarLooks'
const SHORTCUTS = 'shortcuts'

const mine = (campaign: Campaign) => campaign.members.get(device.value.id)

export function slotLook(campaign: Campaign, id: string): SlotLook {
  const looks: Record<string, SlotLook> | undefined = mine(campaign)?.get(LOOKS)
  return looks?.[id] ?? {}
}

/** Change a slot's name or icon; `undefined` puts the action's own back. */
export function setSlotLook(campaign: Campaign, id: string, patch: SlotLook) {
  const entry = mine(campaign)
  if (!entry) return
  const looks: Record<string, SlotLook> = { ...entry.get(LOOKS) }
  const next: SlotLook = { ...looks[id], ...patch }
  for (const k of Object.keys(next) as (keyof SlotLook)[]) if (!next[k]) delete next[k]
  if (Object.keys(next).length) looks[id] = next
  else delete looks[id]
  entry.set(LOOKS, looks)
}

/** Action id to key combo, as `comboOf` writes it. */
export function shortcuts(campaign: Campaign): Record<string, string> {
  return mine(campaign)?.get(SHORTCUTS) ?? {}
}

export const shortcutFor = (campaign: Campaign, id: string): string | undefined => shortcuts(campaign)[id]

/** Bind a combo to an action, taking it from any other action that had it; null unbinds. */
export function setShortcut(campaign: Campaign, id: string, combo: string | null) {
  const entry = mine(campaign)
  if (!entry) return
  entry.set(SHORTCUTS, rebind(shortcuts(campaign), id, combo))
}

export function rebind(all: Record<string, string>, id: string, combo: string | null): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries(all)) if (k !== id && v !== combo) next[k] = v
  if (combo) next[id] = combo
  return next
}

/** The action a combo runs, if any. */
export function actionForCombo(all: Record<string, string>, combo: string): string | undefined {
  return Object.keys(all).find((id) => all[id] === combo)
}

const MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Fn', 'OS']

/**
 * A key press as a combo like `Ctrl+Shift+R`, or null for a lone modifier.
 * Letters and digits come from the physical key, so Alt+R on a Mac (which
 * types ®) is still Alt+R.
 */
export function comboOf(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (MODIFIERS.includes(e.key)) return null
  const letter = /^Key([A-Z])$/.exec(e.code)?.[1]
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1]
  let key = letter ?? digit ?? (e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key)
  if (!key || key === 'Unidentified' || key === 'Dead') return null
  if (key.startsWith('Arrow')) key = key.slice(5)
  const parts = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  return [...parts, key].join('+')
}

/** Whether a combo should still fire while typing in a field: only with Ctrl or Cmd held. */
export const firesWhileTyping = (combo: string) => /(^|\+)(Ctrl|Meta)\+/.test(combo)

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MAC_GLYPHS: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' }
const ARROWS: Record<string, string> = { Up: '↑', Down: '↓', Left: '←', Right: '→' }

/** A combo as people read it: ⌥⇧R on a Mac, Alt+Shift+R elsewhere. */
export function showCombo(combo: string, mac = MAC): string {
  const parts = combo.split('+')
  // "+" itself is a key: `Shift++`.
  if (combo.endsWith('++')) parts.splice(-2, 2, '+')
  const key = ARROWS[parts[parts.length - 1]] ?? parts[parts.length - 1]
  const mods = parts.slice(0, -1)
  if (mac) return mods.map((m) => MAC_GLYPHS[m]).join('') + key
  return [...mods.map((m) => (m === 'Meta' ? 'Win' : m)), key].join('+')
}
