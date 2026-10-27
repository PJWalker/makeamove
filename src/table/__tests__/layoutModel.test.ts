import { describe, expect, it } from 'vitest'
import { PANEL_ORDER, close, defaultLayout, detach, dock, locate, normalise, reorder, selectTab, setOpen, showTab, withoutPanels } from '../layoutModel'

const win = { x: 10, y: 10, w: 300, h: 300, z: 1 }
const everywhere = (l: ReturnType<typeof defaultLayout>) =>
  [...l.left.panels, ...l.right.panels, ...l.floating.map((w) => w.id)].sort()

describe('panel layout', () => {
  it('starts with characters on the left and chat on the right', () => {
    const l = defaultLayout(false)
    expect(l.left.panels).toEqual(['scene', 'characters', 'combat'])
    expect(l.right.panels).toEqual(['chat', 'libraries', 'items', 'notes', 'members'])
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
    expect(l.left).toMatchObject({ active: 'scene', panels: ['scene', 'combat'] })
    l = detach(detach(l, 'scene', win), 'combat', win)
    expect(l.left).toMatchObject({ active: null, open: false, panels: [] })
    expect(everywhere(l)).toEqual([...PANEL_ORDER].sort())
  })

  it('docks a floating panel back on its home side, or on another one', () => {
    let l = detach(defaultLayout(false), 'chat', win)
    expect(dock(l, 'chat').right.panels).toContain('chat')
    l = dock(l, 'chat', 'left')
    expect(l.left).toMatchObject({ active: 'chat', open: true })
    expect(l.left.panels).toEqual(['scene', 'characters', 'combat', 'chat'])
    expect(l.floating).toEqual([])
    expect(l.home.chat).toBe('left')
    expect(everywhere(l)).toEqual([...PANEL_ORDER].sort());
  })

  it('leaves a closed sidebar closed when a panel is dropped on it', () => {
    let l = setOpen(detach(defaultLayout(false), 'chat', win), 'left', false)
    l = dock(l, 'chat', 'left', 0, false)
    expect(l.left).toMatchObject({ active: 'chat', open: false })
    expect(l.left.panels[0]).toBe('chat')
    l = dock(detach(l, 'notes', win), 'notes', 'right', undefined, false)
    expect(l.right).toMatchObject({ active: 'notes', open: true })
  })

  it('moves a docked tab between sides and repairs the side it left', () => {
    let l = dock(defaultLayout(false), 'characters', 'right', 0)
    expect(l.right.panels[0]).toBe('characters')
    expect(l.left).toMatchObject({ active: 'scene', panels: ['scene', 'combat'] })
    l = setOpen(l, 'left', false)
    expect(l.left.open).toBe(false)
  })

  it('repairs saved data', () => {
    const l = normalise(
      { right: { active: 'bogus', open: true, width: 400, panels: ['chat', 'chat', 'nope'] }, floating: [{ id: 'libraries', ...win }] },
      false,
    )
    expect(everywhere(l)).toEqual([...PANEL_ORDER].sort())
    expect(l.right).toMatchObject({ active: 'chat', width: 400 })
    expect(locate(l, 'libraries')).toBe('floating')
    expect(normalise(null, true).right.open).toBe(false)
  })

  it('reorders tabs within a side without changing the open tab', () => {
    const l = reorder(defaultLayout(false), 'members', 0)
    expect(l.right.panels).toEqual(['members', 'chat', 'libraries', 'items', 'notes'])
    expect(l.right.active).toBe('chat')
    expect(reorder(l, 'members', 99).right.panels).toEqual(['chat', 'libraries', 'items', 'notes', 'members'])
  })

  it('puts a panel missing from saved data back on its default side', () => {
    const l = normalise({ left: { panels: ['characters'] }, right: { panels: ['chat', 'notes', 'members'] } }, false)
    expect(l.left.panels).toEqual(['characters', 'scene', 'combat'])
    expect(l.right.panels).toEqual(['chat', 'notes', 'members', 'libraries', 'items'])
  })

  it('leaves out panels the campaign doesn’t have, as shown', () => {
    const l = withoutPanels(showTab(defaultLayout(false), 'combat'), ['combat'])
    expect(l.left).toMatchObject({ active: 'scene', panels: ['scene', 'characters'] })
  })

  it('closes a panel, keeps it closed on reload, and reopens it where it was', () => {
    const l = close(defaultLayout(false), 'notes')
    expect(l.right.panels).not.toContain('notes')
    expect(locate(l, 'notes')).toBe('closed')
    expect(normalise(JSON.parse(JSON.stringify(l)), false).closed).toEqual(['notes'])
    // Showing it (a link to a page, say) opens it again on its own side.
    const back = showTab(l, 'notes')
    expect(back.right.panels).toContain('notes')
    expect(back.closed).toEqual([])
    expect(back.right.active).toBe('notes')
  })
})
