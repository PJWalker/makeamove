import { describe, expect, it } from 'vitest'
import { PANEL_ORDER, SIDEBAR_DEFAULT_W, SIDEBAR_MIN_W, close, defaultLayout, detach, dock, keyedSideWidth, locate, normalise, reorder, resizeSide, setOpen, showTab, withoutPanels } from '../layoutModel'

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

  it('docks entity windows alongside panels and preserves their home side', () => {
    const id = 'entity:link:character:hero'
    let l = dock(defaultLayout(false), id, 'left', 1)
    expect(l.left.panels).toEqual(['scene', id, 'characters', 'combat'])
    expect(locate(l, id)).toBe('left')
    l = detach(l, id, win)
    expect(locate(l, id)).toBe('floating')
    expect(dock(l, id).left.panels).toContain(id)
    expect(locate(close(l, id), id)).toBe('closed')
  })

  it('normalizes and persists namespaced entity tabs without duplicating them', () => {
    const id = 'entity:inventory:character:item'
    const l = normalise(
      {
        left: { active: id, open: true, panels: [id, 'characters', id] },
        right: { panels: ['chat'] },
        floating: [{ id: 'entity:link:note:page', ...win }],
      },
      false,
    )
    expect(l.left.panels).toEqual([id, 'characters', 'scene', 'combat'])
    expect(l.left.active).toBe(id)
    expect(locate(l, 'entity:link:note:page')).toBe('floating')
    expect(l.right.panels).toEqual(['chat', 'libraries', 'items', 'notes', 'members'])
  })
})

describe('sidebar resizing', () => {
  const max = 600
  const side = (open: boolean, width = SIDEBAR_DEFAULT_W) => ({ ...defaultLayout(false).right, open, width })

  it('clamps a width between the minimum and the maximum, reopening a shut side', () => {
    const l = setOpen(defaultLayout(false), 'right', false)
    expect(resizeSide(l, 'right', 200, max).right).toMatchObject({ open: true, width: SIDEBAR_MIN_W })
    expect(resizeSide(l, 'right', 5000, max).right).toMatchObject({ open: true, width: max })
    expect(resizeSide(l, 'right', 401.6, max).right).toMatchObject({ open: true, width: 402 })
  })

  it('shuts a side pulled very narrow and keeps its last width', () => {
    const l = resizeSide(defaultLayout(false), 'left', 100, max)
    expect(l.left).toMatchObject({ open: false, width: SIDEBAR_DEFAULT_W })
    expect(resizeSide(l, 'left', 0, max)).toBe(l)
  })

  it('steps with the arrow keys in the direction that widens each side', () => {
    expect(keyedSideWidth(side(true), 'ArrowLeft', false, -1, max)).toBe(SIDEBAR_DEFAULT_W + 16)
    expect(keyedSideWidth(side(true), 'ArrowRight', false, -1, max)).toBe(SIDEBAR_DEFAULT_W - 16)
    expect(keyedSideWidth(side(true), 'ArrowRight', true, 1, max)).toBe(SIDEBAR_DEFAULT_W + 64)
    expect(keyedSideWidth(side(true, SIDEBAR_MIN_W), 'ArrowLeft', true, 1, max)).toBe(SIDEBAR_MIN_W)
  })

  it('reopens a shut side at its last width, and ignores shrinking it further', () => {
    expect(keyedSideWidth(side(false, 420), 'ArrowLeft', false, -1, max)).toBe(420)
    expect(keyedSideWidth(side(false, 420), 'ArrowRight', false, -1, max)).toBeNull()
  })

  it('jumps with Home, End and Enter, and ignores other keys', () => {
    expect(keyedSideWidth(side(true), 'Home', false, 1, max)).toBe(0)
    expect(keyedSideWidth(side(true), 'End', false, 1, max)).toBe(max)
    expect(keyedSideWidth(side(true, 500), 'Enter', false, 1, max)).toBe(SIDEBAR_DEFAULT_W)
    expect(keyedSideWidth(side(true), 'Tab', false, 1, max)).toBeNull()
  })
})
