import { signal } from '@preact/signals'

/** Recently run actions, newest first, remembered on this device. */
const KEY = 'mam:recent-actions'
const MAX = 12

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

export const recentActions = signal<string[]>(load())

export function noteRecent(id: string) {
  recentActions.value = [id, ...recentActions.value.filter((x) => x !== id)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(recentActions.value))
  } catch {
    // Recents just won't persist.
  }
}
