import { describe, expect, it } from 'vitest'
import { PANEL_ORDER, defaultLayout, detach, dock, locate, normalise, selectTab, setOpen, showTab } from '../layoutModel'

const win = { x: 10, y: 10, w: 300, h: 300, z: 1 }
const everywhere = (l: ReturnType<typeof defaultLayout>) =>
  [...l.left.panels, ...l.right.panels, ...l.floating.map((w) => w.id)].sort()

describe('panel layout', () => {
  it('starts with characters on the left and chat on the right', () => {
    const l = defaultLayout(false)
    expect(l.left.panels).toEqual(['characters', 'items'])
    expect(l.right.active).toBe('chat')
  })

  it('opens and closes a side by clicking its active tab', () => {
    let l = defaultLayout(false)
    l = selectTab(l, 'chat')
    expect(l.right.open).toBe(false)
    l = selectTab(l, 'chat')
    expect(l.right.open).toBe(true)
    l = selectTab(l, 'members')
    expect(l.right).toMatchObject({ active: 'members', open: true })
    expect(showTab(l, 'notes').right.active).toBe('notes')
  })

  it('floats a panel, picks another tab, and closes an emptied side', () => {
    let l = defaultLayout(false)
    l = detach(l, 'characters', win)
    expect(locate(l, 'characters')).toBe('floating')
    expect(l.left).toMatchObject({ active: 'items', panels: ['items'] })
    l = detach(l, 'items', win)
    expect(l.left).toMatchObject({ active: null, open: false, panels: [] })
    expect(everywhere(l)).toEqual([...PANEL_ORDER].sort())
  })

  it('docks a floating panel back on its home side, or on another one', () => {
    let l = detach(defaultLayout(false), 'chat', win)
    expect(dock(l, 'chat').right.panels).toContain('chat')
    l = dock(l, 'chat', 'left')
    expect(l.left).toMatchObject({ active: 'chat', open: true })
    expect(l.left.panels).toEqual(['characters', 'items', 'chat'])
    expect(l.floating).toEqual([])
    expect(l.home.chat).toBe('left')
    expect(everywhere(l)).toEqual([...PANEL_ORDER].sort());
  })

  it('moves a docked tab between sides and repairs the side it left', () => {
    let l = dock(defaultLayout(false), 'characters', 'right', 0)
    expect(l.right.panels[0]).toBe('characters')
    expect(l.left).toMatchObject({ active: 'items', panels: ['items'] })
    l = setOpen(l, 'left', false)
    expect(l.left.open).toBe(false)
  })

  it('repairs saved data', () => {
    const l = normalise(
      { right: { active: 'bogus', open: true, width: 400, panels: ['chat', 'chat', 'nope'] }, floating: [{ id: 'items', ...win }] },
      false,
    )
    expect(everywhere(l)).toEqual([...PANEL_ORDER].sort())
    expect(l.right).toMatchObject({ active: 'chat', width: 400 })
    expect(locate(l, 'items')).toBe('floating')
    expect(normalise(null, true).right.open).toBe(false)
  })
})
