import { describe, expect, it } from 'vitest'
import { actionForCombo, comboOf, firesWhileTyping, rebind, showCombo } from '../custom'

const key = (key: string, code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
})

describe('shortcuts', () => {
  it('names a key press by its physical key and modifiers', () => {
    expect(comboOf(key('r', 'KeyR'))).toBe('R')
    expect(comboOf(key('®', 'KeyR', { altKey: true }))).toBe('Alt+R')
    expect(comboOf(key('!', 'Digit1', { shiftKey: true, ctrlKey: true }))).toBe('Ctrl+Shift+1')
    expect(comboOf(key('ArrowUp', 'ArrowUp', { metaKey: true }))).toBe('Meta+Up')
    expect(comboOf(key(' ', 'Space'))).toBe('Space')
    expect(comboOf(key('F5', 'F5'))).toBe('F5')
    expect(comboOf(key('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull()
  })
  it('shows combos the platform’s way', () => {
    expect(showCombo('Ctrl+Alt+Shift+Meta+R', true)).toBe('⌃⌥⇧⌘R')
    expect(showCombo('Meta+Up', false)).toBe('Win+↑')
    expect(showCombo('Shift++', false)).toBe('Shift++')
  })
  it('gives each combo to one action', () => {
    const all = rebind({ a: 'R', b: 'Ctrl+K' }, 'c', 'R')
    expect(all).toEqual({ b: 'Ctrl+K', c: 'R' })
    expect(actionForCombo(all, 'R')).toBe('c')
    expect(rebind(all, 'c', null)).toEqual({ b: 'Ctrl+K' })
  })
  it('only fires while typing with Ctrl or Cmd', () => {
    expect(firesWhileTyping('R')).toBe(false)
    expect(firesWhileTyping('Shift+R')).toBe(false)
    expect(firesWhileTyping('Ctrl+R')).toBe(true)
    expect(firesWhileTyping('Alt+Meta+R')).toBe(true)
  })
})
