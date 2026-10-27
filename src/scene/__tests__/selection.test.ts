import { describe, expect, it, vi } from 'vitest'

vi.mock('../renderer', () => ({
  HANDLE_SIZE: 10,
  rotateHandlePosition: () => ({ x: -999, y: -999 }),
}))
vi.mock('../../store/device', () => ({ device: { value: { id: 'x' } } }))
vi.mock('../images', () => ({ importImage: vi.fn(), imageColour: vi.fn() }))

const { SceneController } = await import('../controller')

function setup(els: any[]) {
  const host: any = new EventTarget()
  host.style = {}
  host.getBoundingClientRect = () => ({ left: 0, top: 0 })
  host.setPointerCapture = () => {}
  const renderer: any = {
    camera: { x: 0, y: 0, zoom: 1 },
    previews: new Map(),
    hidden: new Set(),
    overlayState: {},
    grid: { type: 'none', size: 70, offsetX: 0, offsetY: 0 },
    size: { width: 800, height: 600 },
    invalidate: () => {},
    setElements: () => {},
    setCamera: () => {},
    setGrid: () => {},
    setHoverToken: () => {},
  }
  const scene: any = {
    views: () => els,
    elements: { observeDeep() {}, unobserveDeep() {} },
    settings: { observe() {}, unobserve() {} },
    undo: { on() {}, off() {}, canUndo: () => false, canRedo: () => false },
    grid: () => renderer.grid,
    update: vi.fn(),
  }
  const c = new SceneController(scene, renderer, host, 's', () => ({}) as any)
  ;(c as any).restoreCamera = () => {}
  c.start()
  const fire = (type: string, x: number, y: number, extra = {}) => {
    const e: any = new Event(type)
    Object.assign(e, { pointerId: 1, button: 0, clientX: x, clientY: y, shiftKey: false, altKey: false, ...extra })
    host.dispatchEvent(e)
  }
  return { c, renderer, scene, fire }
}

const token = (id: string, x: number, y: number) => ({ id, type: 'token', x, y, w: 40, h: 40, rot: 0, locked: false, layer: 'token', z: 'a', colour: '#fff', name: '' })

describe('select tool', () => {
  it('marquee selects elements inside a dragged rectangle', () => {
    const { c, renderer, fire } = setup([token('a', 100, 100), token('b', 130, 120), token('far', 500, 500)])
    fire('pointerdown', 50, 50)
    fire('pointermove', 100, 100)
    fire('pointermove', 200, 200)
    expect(renderer.overlayState.marquee).toEqual({ x: 50, y: 50, w: 150, h: 150 })
    fire('pointerup', 200, 200)
    expect(c.selection.value.sort()).toEqual(['a', 'b'])
  })

  it('rotates a multi-selection around its centre', () => {
    const { c, renderer, scene, fire } = setup([token('a', 100, 100), token('b', 200, 100)])
    c.selection.value = ['a', 'b']
    ;(c as any).updateOverlay()
    const frame = renderer.overlayState.group
    expect(frame).toMatchObject({ x: 150, y: 100 })
    // Pretend the knob sits at the frame's right edge, then turn it 90° clockwise.
    renderer.overlayState.group = frame
    ;(c as any).handleAt = () => ({ kind: 'rotate' })
    fire('pointerdown', 250, 100)
    fire('pointermove', 150, 200)
    const a = renderer.previews.get('a')
    expect(a.x).toBeCloseTo(150)
    expect(a.y).toBeCloseTo(50)
    expect(a.rot).toBeCloseTo(Math.PI / 2)
    fire('pointerup', 150, 200)
    expect(scene.update).toHaveBeenCalledTimes(1)
    expect(scene.update.mock.calls[0][0]).toHaveLength(2)
  })
})
