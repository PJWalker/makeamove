import { effect, signal, untracked } from '@preact/signals'
import type { CampaignDefaults } from '../store/campaign'
import { device } from '../store/device'
import { colourOf, type Presence } from './presence'
import { type Camera, clampZoom, fitCamera, toWorld, zoomAt } from './camera'
import { CORNER_SIGNS, type Corner, bounds, contains, corners, fromLocal, hits, resizeFromCorner, rotationTowards, tokensCovered } from './geometry'
import { type Point, snapPoint, snapSize } from './grid'
import { importImage, imageColour } from './images'
import { formatDistance, tokenDistance } from './measure'
import { wallEnds } from './vision'
import { HANDLE_SIZE, type LightPart, type SceneRenderer, lightHandles, rotateHandlePosition } from './renderer'
import type { SceneDoc } from './sceneDoc'
import { finishStroke, STRIDE } from './stroke'
import { activeTool, ERASER_RADIUS, lightTool, pen, SHAPE_WIDTH, shapeTool, TEMPLATE_STYLE } from './tools'
import { AREA_COLOURS, LAYERS, type BlobRef, type Layer, type AreaTone, type LightElement, type NewElement, type SceneElement, type TokenElement, type ShapeKind, type TokenStyle, type Transform } from './types'

/** A new lamp's size, in cells: its shadows' softness. Resizing the lamp makes them softer or sharper. */
const LAMP_SIZE = 0.6

/** A new light: bright for 4 cells (20 ft on a 5 ft grid), dim for 4 more, warm. */
const LIGHT_DEFAULT = (cell: number) => ({ bright: cell * 4, dim: cell * 8, colour: '#ffd27a' })

/** An action's area waiting to be placed: its shape and size in world px, and who to tell. */
export interface Placement {
  shape: ShapeKind
  /** A radius, a side, or a length. */
  length: number
  /** A line's width. */
  width: number
  onPlaced: (placed: { id: string; covered: string[] } | null) => void
}

type Gesture =
  | { kind: 'pan'; start: Point; cam: Camera }
  | { kind: 'pinch'; dist: number; mid: Point; cam: Camera }
  | { kind: 'move'; start: Point; originals: Map<string, SceneElement>; moved: boolean }
  | { kind: 'resize'; el: SceneElement; corner: Corner }
  | { kind: 'rotate'; el: SceneElement }
  | { kind: 'light'; el: LightElement; part: LightPart }
  | { kind: 'rotateGroup'; frame: Transform; originals: SceneElement[]; startAngle: number; delta: number }
  | { kind: 'marquee'; start: Point; base: string[]; pick: string | null; moved: boolean }
  | { kind: 'draw'; points: number[]; layer: Layer; colour: string; width: number }
  | { kind: 'erase'; erased: Set<string> }
  | { kind: 'ruler' }
  | { kind: 'trail'; start: Point; active: boolean }
  | { kind: 'shape'; start: Point; shape: ShapeKind; fixed: Placement | null }
  | { kind: 'wall'; start: Point }

/** Screen px the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 3

const RESIZE_CURSORS = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize']

/** The cursor over each of a light's handles, which sit right, up-right and down-right of it. */
const LIGHT_CURSORS: Record<LightPart, string> = { lamp: 'ew-resize', bright: 'nesw-resize', dim: 'nwse-resize' }

/** This member's token colour, from their device id. */
const memberColour = () => colourOf(device.value)

const cameraKey = (sceneId: string) => `mam:camera:${sceneId}`

/**
 * Turns pointer, wheel and keyboard input into camera moves and scene edits.
 * Drags update the renderer's previews only; the CRDT changes once, on
 * release, so each drag is a single undo step (and, from M2, a single
 * update for peers).
 */
export class SceneController {
  readonly selection = signal<string[]>([])
  /** Dominant colour of the scene's largest map, for the UI tint. */
  readonly mapColour = signal<string | null>(null)
  readonly canUndo = signal(false)
  readonly canRedo = signal(false)
  /**
   * While an action asks for targets: clicking a token targets it (or stops
   * targeting it) instead of selecting it. `max` caps how many; past it the
   * oldest target drops off. `actor` is the acting character, whose token
   * distances are measured from.
   */
  readonly targetMode = signal<{ max?: number; actor?: string } | null>(null)
  /** Tokens chosen while targeting, shared with peers through presence. */
  readonly targets = signal<string[]>([])
  /** Bumps whenever the scene's elements change. */
  readonly revision = signal(0)

  /** An area to place for an action: the next drag on the map puts it down (see placeArea). */
  readonly placing = signal<Placement | null>(null)

  /** The corners of an area of solid light or dark being placed, a click at a time. */
  private area: { tone: AreaTone; points: Point[] } | null = null

  /** Whether this device is the GM's: only the GM sees and edits walls and lights. */
  gm = false

  /** Asks the canvas for text to put on the map, or to change: set by SceneCanvas. */
  onTextRequest: ((req: { at: Point; screen: Point; id?: string; text?: string }) => void) | null = null

  private elements: SceneElement[] = []
  /** The scene's elements as they are now, bottom to top. */
  allElements(): readonly SceneElement[] {
    return this.elements
  }
  private byId = new Map<string, SceneElement>()
  private gesture: Gesture | null = null
  private pointers = new Map<number, Point>()
  private spaceHeld = false
  private hover: Point | null = null
  private disposers: (() => void)[] = []
  private saveTimer = 0

  readonly scene: SceneDoc
  readonly renderer: SceneRenderer
  readonly host: HTMLElement
  readonly sceneId: string
  /** The campaign's current defaults for new things. */
  readonly defaults: () => CampaignDefaults
  private presence: Presence | null
  private lastCursor = 0
  private ruler: Point | null = null

  constructor(
    scene: SceneDoc,
    renderer: SceneRenderer,
    host: HTMLElement,
    sceneId: string,
    defaults: () => CampaignDefaults,
    presence: Presence | null = null,
  ) {
    this.presence = presence
    this.scene = scene
    this.renderer = renderer
    this.host = host
    this.sceneId = sceneId
    this.defaults = defaults
  }

  start() {
    const refresh = () => this.refresh()
    const regrid = () => {
      this.renderer.setGrid(this.scene.grid())
    }
    const history = () => {
      this.canUndo.value = this.scene.undo.canUndo()
      this.canRedo.value = this.scene.undo.canRedo()
    }
    this.scene.elements.observeDeep(refresh)
    this.scene.settings.observe(regrid)
    this.scene.undo.on('stack-item-added', history)
    this.scene.undo.on('stack-item-popped', history)
    this.disposers.push(
      () => this.scene.elements.unobserveDeep(refresh),
      () => this.scene.settings.unobserve(regrid),
      () => this.scene.undo.off('stack-item-added', history),
      () => this.scene.undo.off('stack-item-popped', history),
      effect(() => {
        void this.selection.value
        this.updateOverlay()
      }),
      effect(() => {
        void activeTool.value
        void lightTool.value
        // Only a tool change should cancel a gesture, not the selection
        // changes that a marquee makes as it goes.
        untracked(() => {
          // Lamps and areas show, and stay selected, only in the Lights tool.
          this.renderer.lightsShown = activeTool.value === 'light'
          const keep = this.selection.value.filter((id) => {
            const el = this.byId.get(id)
            return el && this.pickable(el)
          })
          if (keep.length !== this.selection.value.length) this.selection.value = keep
          this.cancelGesture()
          this.updateCursor()
          this.updateOverlay()
        })
      }),
    )
    this.renderer.insets = () => {
      const host = this.host.getBoundingClientRect()
      // Autohiding chrome doesn't cover the scene.
      if (this.host.closest('.table')?.getAttribute('data-autohide') === 'true') return { left: 0, right: 0, top: 0 }
      const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect()
      const tools = rect('.toolbar')
      const leftRail = rect('.sidebar[data-side="left"] .sidebar-rail')
      const rightRail = rect('.sidebar[data-side="right"] .sidebar-rail')
      return {
        left: leftRail ? Math.max(0, leftRail.right - host.left) : 0,
        right: rightRail ? Math.max(0, host.right - rightRail.left) : 0,
        top: tools ? Math.max(0, tools.bottom - host.top) : 0,
      }
    }
    if (this.presence) {
      const presence = this.presence
      const show = () => this.renderer.setPresence(presence.marks(this.sceneId, device.value.id, device.value.name, colourOf(device.value)))
      presence.setScene(this.sceneId)
      this.disposers.push(presence.subscribe(show), () => presence.setScene(null), () => this.renderer.setPresence([]))
      this.disposers.push(effect(() => {
        void device.value
        untracked(show)
      }))
      show()
    }
    regrid()
    this.refresh()
    this.restoreCamera()
    this.renderer.onCameraChange = () => this.scheduleSaveCamera()

    const el = this.host
    const listen = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts)
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener, opts))
    }
    listen('pointerdown', (e) => this.onPointerDown(e))
    listen('pointermove', (e) => this.onPointerMove(e))
    listen('pointerup', (e) => this.onPointerUp(e))
    listen('pointercancel', (e) => this.onPointerUp(e, true))
    listen('pointerleave', () => {
      this.presence?.setCursor(null)
      this.hover = null
      this.renderer.setHoverToken(null)
      this.updateOverlay()
    })
    listen('wheel', (e) => this.onWheel(e), { passive: false })
  }

  stop() {
    this.cancelGesture()
    this.renderer.onCameraChange = null
    clearTimeout(this.saveTimer)
    this.saveCamera()
    for (const d of this.disposers) d()
    this.disposers = []
  }

  // State

  private refresh() {
    this.revision.value++
    this.elements = this.scene.views()
    this.byId = new Map(this.elements.map((e) => [e.id, e]))
    this.renderer.setElements(this.elements)
    const targets = this.targets.value.filter((id) => this.byId.get(id)?.type === 'token')
    if (targets.length !== this.targets.value.length) this.setTargets(targets)
    const sel = this.selection.value.filter((id) => this.byId.has(id))
    if (sel.length !== this.selection.value.length) this.selection.value = sel
    else this.updateOverlay()
    this.updateMapColour()
  }

  private updateMapColour() {
    let main: SceneElement | null = null
    for (const el of this.elements) if (el.type === 'map' && (!main || el.w * el.h > main.w * main.h)) main = el
    if (!main || main.type !== 'map') {
      this.mapColour.value = null
      return
    }
    imageColour(main.image.hash).then((c) => (this.mapColour.value = c))
  }

  selected(): SceneElement[] {
    return this.selection.value.map((id) => this.byId.get(id)).filter((e): e is SceneElement => !!e)
  }

  element(id: string) {
    return this.byId.get(id) ?? null
  }

  private updateOverlay() {
    const tool = activeTool.value
    const selected = this.selecting() ? this.selected() : []
    const g = this.gesture
    const movable = selected.filter((el) => !el.locked)
    const groupBounds = movable.length > 1 && (!g || g.kind === 'rotateGroup') ? bounds(movable) : null
    this.renderer.overlayState = {
      selected,
      handles: selected.length === 1 && !selected[0].locked && (!g || g.kind === 'resize' || g.kind === 'rotate' || g.kind === 'light'),
      group:
        g?.kind === 'rotateGroup'
          ? { ...g.frame, rot: g.delta }
          : groupBounds && { x: groupBounds.x + groupBounds.w / 2, y: groupBounds.y + groupBounds.h / 2, w: groupBounds.w, h: groupBounds.h, rot: 0 },
      marquee:
        g?.kind === 'marquee' && this.hover
          ? {
              x: Math.min(g.start.x, this.hover.x),
              y: Math.min(g.start.y, this.hover.y),
              w: Math.abs(this.hover.x - g.start.x),
              h: Math.abs(this.hover.y - g.start.y),
            }
          : null,
      eraser: tool === 'erase' && this.hover ? { p: this.hover, r: ERASER_RADIUS / this.renderer.camera.zoom } : null,
      rangeFrom: this.rangeFrom(),
    }
    this.renderer.invalidate('overlay')
  }

  /** The token distances to targets are measured from: the acting character's first token. */
  rangeFrom(): string | null {
    const actor = this.targetMode.value?.actor
    if (!actor) return null
    return this.elements.find((el) => el.type === 'token' && el.characterId === actor)?.id ?? null
  }

  /** Target a token, or stop targeting it. */
  toggleTarget(id: string) {
    const t = this.targets.value
    const max = this.targetMode.value?.max
    const next = t.includes(id) ? t.filter((x) => x !== id) : [...t, id]
    this.setTargets(max !== undefined ? next.slice(-max) : next)
  }

  /** The chosen targets, with each one's distance from the actor's token (null without one). */
  targetDetails(): { id: string; name: string; characterId?: string; distance: number | null }[] {
    const fromId = this.rangeFrom()
    const from = fromId ? this.byId.get(fromId) : undefined
    return this.targets.value.flatMap((id) => {
      const el = this.byId.get(id)
      if (el?.type !== 'token') return []
      return [
        {
          id,
          name: el.name || 'Unnamed token',
          ...(el.characterId ? { characterId: el.characterId } : {}),
          distance: from ? tokenDistance(this.renderer.grid, from, el) : null,
        },
      ]
    })
  }

  /** Start or stop asking for targets; stopping clears them. */
  setTargetMode(mode: { max?: number; actor?: string } | null) {
    this.targetMode.value = mode
    if (!mode) this.setTargets([])
    this.updateOverlay()
    this.updateCursor()
  }

  setTargets(ids: string[]) {
    this.targets.value = ids
    this.presence?.setTargets(ids)
    this.updateOverlay()
  }

  private updateCursor(cursor?: string) {
    const tool = activeTool.value
    const g = this.gesture
    this.host.style.cursor =
      cursor ??
      (g?.kind === 'pan' || g?.kind === 'pinch'
        ? 'grabbing'
        : this.spaceHeld || tool === 'pan'
          ? 'grab'
          : this.placing.value || tool === 'draw' || tool === 'shape' || tool === 'wall' || (tool === 'light' && !this.selecting()) || tool === 'ruler' || tool === 'ping' || (tool === 'select' && this.targetMode.value)
            ? 'crosshair'
            : tool === 'text'
              ? 'text'
            : tool === 'erase'
              ? 'none'
              : 'default')
  }

  // Camera

  private restoreCamera() {
    try {
      const saved = JSON.parse(localStorage.getItem(cameraKey(this.sceneId)) ?? 'null')
      if (saved && typeof saved.zoom === 'number') {
        this.renderer.setCamera(saved)
        return
      }
    } catch {
      // Fall through to fitting the scene.
    }
    this.fit()
  }

  private scheduleSaveCamera() {
    clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => this.saveCamera(), 300)
  }

  private saveCamera() {
    try {
      localStorage.setItem(cameraKey(this.sceneId), JSON.stringify(this.renderer.camera))
    } catch {
      // The view just won't be remembered.
    }
  }

  /** Show everything in the scene, or the origin at 100% if it's empty. */
  fit() {
    const { width, height } = this.renderer.size
    const b = bounds(this.elements)
    this.renderer.setCamera(b ? fitCamera(b, width, height) : { x: width / 2, y: height / 2, zoom: 1 })
  }

  zoomBy(factor: number, at?: Point) {
    const { width, height } = this.renderer.size
    this.renderer.setCamera(zoomAt(this.renderer.camera, at ?? { x: width / 2, y: height / 2 }, factor))
    this.updateOverlay()
  }

  zoomTo(zoom: number) {
    this.zoomBy(clampZoom(zoom) / this.renderer.camera.zoom)
  }

  /** World point under a client (viewport) point. */
  toWorld(clientX: number, clientY: number): Point {
    return toWorld(this.renderer.camera, this.toScreen(clientX, clientY))
  }

  private toScreen(clientX: number, clientY: number): Point {
    const r = this.host.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  centre(): Point {
    const { width, height } = this.renderer.size
    return toWorld(this.renderer.camera, { x: width / 2, y: height / 2 })
  }

  // Hit testing

  /** Whether the tool in use selects: the Select tool, or the Lights tool's own. */
  private selecting(): boolean {
    const tool = activeTool.value
    return tool === 'select' || (tool === 'light' && lightTool.value === 'select')
  }

  /**
   * Whether an element can be picked with the tool in use: in the Lights tool
   * only lamps and areas, which nothing else can pick. Only the GM picks walls.
   */
  private pickable(el: SceneElement): boolean {
    const lamp = el.type === 'light' || el.type === 'area'
    if (activeTool.value === 'light') return lamp && this.gm
    return !lamp && (el.type !== 'wall' || this.gm)
  }

  /** Topmost element under p. Locked elements only count when asked. */
  hitTest(p: Point, includeLocked = false): SceneElement | null {
    const tolerance = 4 / this.renderer.camera.zoom
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i]
      if (el.locked && !includeLocked) continue
      if (!this.pickable(el)) continue
      if (hits(el, p, tolerance)) return el
    }
    return null
  }

  private handleAt(screen: Point): { kind: 'corner'; corner: Corner } | { kind: 'rotate' } | { kind: 'light'; part: LightPart } | null {
    const { selected, handles, group } = this.renderer.overlayState
    const cam = this.renderer.camera
    const reach = HANDLE_SIZE / 2 + 4
    if (group) {
      const knob = rotateHandlePosition(group, cam)
      return Math.hypot(screen.x - knob.x, screen.y - knob.y) <= reach ? { kind: 'rotate' } : null
    }
    if (!handles || selected.length !== 1) return null
    const el = selected[0]
    if (el.type === 'light') {
      const near = lightHandles(el, cam).filter((h) => Math.hypot(screen.x - h.at.x, screen.y - h.at.y) <= reach)
      // The lamp's own handle can sit under a ring's when the light is small; the rings win.
      const h = near.find((h) => h.part !== 'lamp') ?? near[0]
      return h ? { kind: 'light', part: h.part } : null
    }
    const knob = rotateHandlePosition(el, cam)
    if (Math.hypot(screen.x - knob.x, screen.y - knob.y) <= reach) return { kind: 'rotate' }
    const cs = corners(el)
    for (let i = 0; i < 4; i++) {
      const c = { x: cs[i].x * cam.zoom + cam.x, y: cs[i].y * cam.zoom + cam.y }
      if (Math.hypot(screen.x - c.x, screen.y - c.y) <= reach) return { kind: 'corner', corner: i as Corner }
    }
    return null
  }

  // Pointer input

  private onPointerDown(e: PointerEvent) {
    if (e.button === 2) return
    const screen = this.toScreen(e.clientX, e.clientY)
    const world = toWorld(this.renderer.camera, screen)
    this.pointers.set(e.pointerId, screen)
    this.host.setPointerCapture(e.pointerId)
    this.hover = world

    // A second finger turns whatever was happening into a pinch.
    if (this.pointers.size === 2) {
      this.cancelGesture()
      const [a, b] = [...this.pointers.values()]
      this.gesture = {
        kind: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        cam: this.renderer.camera,
      }
      return
    }
    if (this.pointers.size > 2) return

    // Placing an action's area: the press is its origin (or centre), the drag aims it.
    const placing = this.placing.value
    if (placing && e.button === 0 && !this.spaceHeld) {
      this.gesture = { kind: 'shape', start: this.snapShapePoint(world, placing.shape, e), shape: placing.shape, fixed: placing }
      this.showShapeDraft(world, e)
      this.updateCursor()
      return
    }

    const tool = e.button === 1 || this.spaceHeld ? 'pan' : this.selecting() ? 'select' : activeTool.value
    // Double-clicking text changes it.
    if (tool === 'select' && e.detail === 2) {
      const under = this.hitTest(world)
      if (under?.type === 'text') {
        this.onTextRequest?.({ at: { x: under.x, y: under.y }, screen, id: under.id, text: under.text })
        return
      }
    }
    switch (tool) {
      case 'pan':
        this.gesture = { kind: 'pan', start: screen, cam: this.renderer.camera }
        break

      case 'select': {
        const handle = this.handleAt(screen)
        if (handle) {
          const group = this.renderer.overlayState.group
          if (group) {
            const originals = this.selected().filter((el) => !el.locked)
            const startAngle = Math.atan2(world.y - group.y, world.x - group.x)
            this.gesture = { kind: 'rotateGroup', frame: group, originals, startAngle, delta: 0 }
            break
          }
          const el = this.selected()[0]
          this.gesture =
            handle.kind === 'rotate'
              ? { kind: 'rotate', el }
              : handle.kind === 'light' && el.type === 'light'
                ? { kind: 'light', el, part: handle.part }
                : handle.kind === 'corner'
                  ? { kind: 'resize', el, corner: handle.corner }
                  : null
          break
        }
        const under = this.hitTest(world)
        if (this.targetMode.value && under?.type === 'token') {
          this.toggleTarget(under.id)
          break
        }
        // An unselected map is usually just the backdrop: dragging over it
        // draws a marquee, and a click selects it. Select it to move it.
        const hit = under && (under.type !== 'map' || this.selection.value.includes(under.id)) ? under : null
        if (hit) {
          const sel = this.selection.value
          if (e.shiftKey) {
            if (sel.includes(hit.id)) {
              this.selection.value = sel.filter((id) => id !== hit.id)
              break
            }
            this.selection.value = [...sel, hit.id]
          } else if (!sel.includes(hit.id)) {
            this.selection.value = [hit.id]
          }
          const originals = new Map(this.selected().filter((s) => !s.locked).map((s) => [s.id, s]))
          this.gesture = { kind: 'move', start: world, originals, moved: false }
        } else {
          const base = e.shiftKey ? this.selection.value : []
          const pick = under?.id ?? null
          if (!pick) this.selection.value = base
          this.gesture = { kind: 'marquee', start: world, base, pick, moved: !pick }
        }
        break
      }

      case 'draw': {
        const { colour, width, layer } = pen.value
        this.gesture = { kind: 'draw', points: [], layer, colour, width }
        this.addStrokePoint(e, world)
        break
      }

      case 'erase':
        this.gesture = { kind: 'erase', erased: new Set() }
        this.eraseAt(world)
        break

      case 'ping':
        this.presence?.ping(world)
        this.gesture = { kind: 'trail', start: world, active: false }
        break

      case 'ruler':
        this.ruler = world
        this.gesture = { kind: 'ruler' }
        this.presence?.setRuler({ a: world, b: world })
        break

      case 'shape': {
        const shape = shapeTool.value
        this.gesture = { kind: 'shape', start: this.snapShapePoint(world, shape, e), shape, fixed: null }
        this.showShapeDraft(world, e)
        break
      }

      case 'text':
        this.onTextRequest?.({ at: world, screen })
        break

      case 'wall':
        if (!this.gm) break
        this.gesture = { kind: 'wall', start: this.snapWallPoint(world, e) }
        this.showWallDraft(world, e)
        break

      case 'light': {
        if (!this.gm) break
        const mode = lightTool.value
        if (mode === 'light' || mode === 'dark') {
          this.addAreaPoint(mode, world, e)
          break
        }
        const grid = this.renderer.grid
        const at = grid.type === 'square' && !e.altKey ? snapPoint(grid, world, 1) : world
        this.scene.add({ type: 'light', layer: 'over', x: at.x, y: at.y, w: grid.size * LAMP_SIZE, h: grid.size * LAMP_SIZE, rot: 0, ...LIGHT_DEFAULT(grid.size) })
        break
      }
    }
    this.updateCursor()
    this.updateOverlay()
  }

  /**
   * A click while placing an area: its next corner, snapped like a wall's end.
   * A click on its first corner, or a double click, closes it.
   */
  private addAreaPoint(tone: AreaTone, world: Point, e: PointerEvent) {
    const p = this.snapWallPoint(world, e)
    if (this.area?.tone !== tone) this.area = { tone, points: [] }
    const pts = this.area.points
    const first = pts[0]
    const cam = this.renderer.camera
    const onFirst = first && Math.hypot((first.x - p.x) * cam.zoom, (first.y - p.y) * cam.zoom) <= HANDLE_SIZE
    if (pts.length >= 3 && (onFirst || e.detail >= 2)) {
      this.finishArea()
      return
    }
    const last = pts[pts.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) pts.push(p)
    this.showAreaDraft(world, e)
  }

  private showAreaDraft(p: Point, e: { altKey: boolean }) {
    if (!this.area) return
    this.renderer.draft = { kind: 'polygon', points: [...this.area.points, this.snapWallPoint(p, e)], colour: AREA_COLOURS[this.area.tone], layer: 'over' }
    this.renderer.invalidate('overlay')
  }

  /** Put down the area being placed, if it has at least three corners. */
  finishArea() {
    const area = this.area
    this.area = null
    this.renderer.draft = null
    this.renderer.invalidate('overlay')
    if (!area || area.points.length < 3) return
    const xs = area.points.map((p) => p.x)
    const ys = area.points.map((p) => p.y)
    const x = (Math.min(...xs) + Math.max(...xs)) / 2
    const y = (Math.min(...ys) + Math.max(...ys)) / 2
    const w = Math.max(1, Math.max(...xs) - Math.min(...xs))
    const h = Math.max(1, Math.max(...ys) - Math.min(...ys))
    const points = area.points.flatMap((p) => [p.x - x, p.y - y])
    this.scene.add({ type: 'area', layer: 'over', x, y, w, h, rot: 0, tone: area.tone, points, bw: w, bh: h })
  }

  /** Where a wall ends: on another wall's end if one is near, else on a grid corner (Alt places freely). */
  private snapWallPoint(p: Point, e: { altKey: boolean }): Point {
    if (e.altKey) return p
    const reach = 12 / this.renderer.camera.zoom
    let best: Point | null = null
    let bestD = reach
    for (const el of this.elements) {
      if (el.type !== 'wall') continue
      const { a, b } = wallEnds(el)
      for (const q of [a, b]) {
        const d = Math.hypot(q.x - p.x, q.y - p.y)
        if (d < bestD) {
          best = q
          bestD = d
        }
      }
    }
    if (best) return best
    const grid = this.renderer.grid
    if (grid.type !== 'square') return p
    return {
      x: grid.offsetX + Math.round((p.x - grid.offsetX) / grid.size) * grid.size,
      y: grid.offsetY + Math.round((p.y - grid.offsetY) / grid.size) * grid.size,
    }
  }

  /** A wall from where the drag started to (snapped) p. */
  private wallFrom(start: Point, p: Point, e: { altKey: boolean }): Transform {
    const end = this.snapWallPoint(p, e)
    const len = Math.hypot(end.x - start.x, end.y - start.y)
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, w: len, h: 6, rot: Math.atan2(end.y - start.y, end.x - start.x) }
  }

  private showWallDraft(p: Point, e: { altKey: boolean }) {
    const g = this.gesture
    if (g?.kind !== 'wall') return
    const t = this.wallFrom(g.start, p, e)
    const grid = this.renderer.grid
    this.renderer.draft = {
      kind: 'shape',
      shape: 'line',
      t: { ...t, h: 3 / this.renderer.camera.zoom },
      colour: '#d8e0ff',
      width: 2,
      layer: 'over',
      label: formatDistance(grid, (t.w / grid.size) * grid.unit),
    }
    this.renderer.invalidate('overlay', 'presence')
  }

  /** Open or close a door; turn a wall into a door or back. */
  setDoor(id: string, patch: { door?: boolean; open?: boolean }) {
    const el = this.byId.get(id)
    if (el?.type !== 'wall') return
    this.scene.update([[id, { ...patch, ...(patch.door === false ? { open: undefined } : {}) } as Partial<SceneElement>]])
  }

  /**
   * A light with one of its handles dragged to p: the lamp's rim sizes the lamp
   * (softer or sharper shadows); the rings set how far bright and dim light
   * reach, in whole cells unless Alt is held. Dim light never falls short of bright.
   */
  private dragLight(el: LightElement, part: LightPart, p: Point, free: boolean): LightElement {
    const dist = Math.hypot(p.x - el.x, p.y - el.y)
    if (part === 'lamp') {
      const size = Math.max(8, dist * 2)
      return { ...el, w: size, h: size }
    }
    const cell = this.renderer.grid.size
    const r = free ? dist : Math.round(dist / cell) * cell
    if (part === 'bright') {
      const bright = Math.max(0, r)
      return { ...el, bright, dim: Math.max(el.dim, bright) }
    }
    const dim = Math.max(free ? 8 : cell, r)
    return { ...el, dim, bright: Math.min(el.bright, dim) }
  }

  /** Turn an area of light into one of dark, or back. */
  setAreaTone(id: string, tone: AreaTone) {
    if (this.byId.get(id)?.type !== 'area') return
    this.scene.update([[id, { tone } as Partial<SceneElement>]])
  }

  /** Show a light in another colour, without changing it yet; null to stop. */
  previewLightColour(id: string, colour: string | null) {
    const el = this.byId.get(id)
    if (el?.type !== 'light') return
    if (colour) this.renderer.previews.set(id, { ...el, colour } as Transform)
    else this.renderer.previews.delete(id)
    this.renderer.invalidate('previews')
  }

  /** Change a light's colour, or whether it flickers. */
  setLight(id: string, patch: { colour?: string; flicker?: boolean }) {
    if (this.byId.get(id)?.type !== 'light') return
    this.scene.update([[id, patch as Partial<SceneElement>]])
  }

  /** Where a shape starts: a grid corner for squares, a cell centre or corner for the rest (Alt places freely). */
  private snapShapePoint(p: Point, shape: ShapeKind, e: PointerEvent): Point {
    const grid = this.renderer.grid
    if (grid.type !== 'square' || e.altKey) return p
    const half = grid.size / 2
    const step = shape === 'rect' ? grid.size : half
    return {
      x: grid.offsetX + Math.round((p.x - grid.offsetX) / step) * step,
      y: grid.offsetY + Math.round((p.y - grid.offsetY) / step) * step,
    }
  }

  /**
   * The shape a drag from `start` to `p` makes: a square corner to corner, a
   * circle from its centre, a line or cone from its origin. Lengths round to
   * whole grid steps; a placed area has its size fixed and only aims.
   */
  private shapeFrom(g: Extract<Gesture, { kind: 'shape' }>, p: Point, e: { shiftKey: boolean; altKey: boolean }): Transform & { label: string } {
    const grid = this.renderer.grid
    const step = grid.type === 'none' || e.altKey ? 0 : grid.size
    const round = (n: number) => (step ? Math.max(step, Math.round(n / step) * step) : n)
    const units = (n: number) => formatDistance(grid, (n / grid.size) * grid.unit)
    const s = g.start
    const dx = p.x - s.x
    const dy = p.y - s.y
    const fixed = g.fixed
    if (g.shape === 'circle') {
      const r = fixed ? fixed.length : round(Math.hypot(dx, dy))
      return { x: s.x, y: s.y, w: 2 * r, h: 2 * r, rot: 0, label: `${units(r)} radius` }
    }
    if (g.shape === 'rect') {
      if (fixed) return { x: s.x, y: s.y, w: fixed.length, h: fixed.length, rot: 0, label: units(fixed.length) }
      let w = round(Math.abs(dx))
      let h = round(Math.abs(dy))
      if (e.shiftKey) w = h = Math.max(w, h)
      return { x: s.x + (Math.sign(dx) * w) / 2, y: s.y + (Math.sign(dy) * h) / 2, w, h, rot: 0, label: `${units(w)} × ${units(h)}` }
    }
    // Lines and cones run from the start towards the pointer.
    const angle = Math.hypot(dx, dy) > 0 ? Math.atan2(dy, dx) : 0
    const rot = e.shiftKey ? Math.round(angle / (Math.PI / 4)) * (Math.PI / 4) : angle
    const len = fixed ? fixed.length : round(Math.hypot(dx, dy))
    const thick = g.shape === 'cone' ? len : fixed ? fixed.width : grid.size
    return { x: s.x + (Math.cos(rot) * len) / 2, y: s.y + (Math.sin(rot) * len) / 2, w: len, h: thick, rot, label: units(len) }
  }

  private showShapeDraft(p: Point, e: { shiftKey: boolean; altKey: boolean }) {
    const g = this.gesture
    if (g?.kind !== 'shape') return
    const { label, ...t } = this.shapeFrom(g, p, e)
    const { colour, width, layer } = g.fixed ? TEMPLATE_STYLE : { ...pen.value, width: SHAPE_WIDTH }
    this.renderer.draft = { kind: 'shape', shape: g.shape, t, colour, width, layer, label }
    this.renderer.invalidate('overlay', 'presence')
  }

  /**
   * Ask for an action's area to be placed: the next press puts it down and
   * a drag aims it. Calls back with the new shape and the tokens it covers;
   * null if cancelled.
   */
  placeArea(p: Placement | null) {
    this.placing.value?.onPlaced(null)
    this.placing.value = p
    this.updateCursor()
  }

  /** Put text on the map, or change existing text, measured at the size it's drawn. */
  putText(at: Point, text: string, id?: string) {
    const clean = text.trim()
    const old = id ? this.byId.get(id) : undefined
    if (old && old.type !== 'text') return
    if (!clean) {
      if (old) this.scene.remove([old.id])
      return
    }
    const size = old?.size ?? Math.round(this.renderer.grid.size * 0.5)
    const colour = old?.colour ?? pen.value.colour
    const m = this.renderer.measureText(clean, colour, size)
    if (old) {
      const k = old.w / old.bw
      this.scene.update([[old.id, { text: clean, bw: m.w, bh: m.h, w: m.w * k, h: m.h * k }]])
    } else {
      this.scene.add({ type: 'text', layer: pen.value.layer, text: clean, colour, size, x: at.x, y: at.y, w: m.w, h: m.h, bw: m.w, bh: m.h, rot: 0 })
    }
  }

  private onPointerMove(e: PointerEvent) {
    const screen = this.toScreen(e.clientX, e.clientY)
    const world = toWorld(this.renderer.camera, screen)
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, screen)
    this.hover = world
    const g = this.gesture
    const under = this.hitTest(world, true)
    this.renderer.setHoverToken(under?.type === 'token' ? under.id : null)

    // Share the cursor at about 20 Hz.
    const now = performance.now()
    if (this.presence && now - this.lastCursor > 50) {
      this.lastCursor = now
      this.presence.setCursor(world)
    }

    if (!g) {
      if (this.selecting() && !this.spaceHeld) {
        const handle = this.handleAt(screen)
        const hit = !handle && this.hitTest(world)
        this.updateCursor(
          handle?.kind === 'rotate'
            ? 'grab'
            : handle
              ? handle.kind === 'corner'
                ? cornerCursor(this.selected()[0], handle.corner)
                : LIGHT_CURSORS[handle.part]
              : hit
                ? 'move'
                : undefined,
        )
      }
      if (activeTool.value === 'erase') this.updateOverlay()
      if (this.area) this.showAreaDraft(world, e)
      return
    }

    switch (g.kind) {
      case 'pan':
        this.renderer.setCamera({ ...g.cam, x: g.cam.x + screen.x - g.start.x, y: g.cam.y + screen.y - g.start.y })
        break

      case 'pinch': {
        const [a, b] = [...this.pointers.values()]
        if (!a || !b) break
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const panned = { ...g.cam, x: g.cam.x + mid.x - g.mid.x, y: g.cam.y + mid.y - g.mid.y }
        this.renderer.setCamera(zoomAt(panned, mid, dist / g.dist))
        break
      }

      case 'move': {
        const dx = world.x - g.start.x
        const dy = world.y - g.start.y
        if (!g.moved && Math.hypot(dx, dy) * this.renderer.camera.zoom < DRAG_THRESHOLD) break
        g.moved = true
        const grid = this.renderer.grid
        for (const [id, el] of g.originals) {
          let p = { x: el.x + dx, y: el.y + dy }
          // Tokens snap to the grid; hold Alt to place them freely.
          if (el.type === 'token' && !e.altKey) p = snapPoint(grid, p, Math.round(el.w / grid.size))
          this.renderer.previews.set(id, { ...el, ...p })
        }
        this.renderer.invalidate('previews', 'overlay')
        break
      }

      case 'resize': {
        const el = g.el
        let t: Transform
        if (el.type === 'token') {
          const raw = resizeFromCorner(el, g.corner, world, true)
          const size = e.altKey ? raw.w : snapSize(this.renderer.grid, raw.w)
          t = resizeToSize(el, g.corner, size, size)
        } else {
          // Images keep their shape unless Shift is held; drawings the reverse.
          const keepAspect = el.type === 'map' ? !e.shiftKey : e.shiftKey
          t = resizeFromCorner(el, g.corner, world, keepAspect)
        }
        this.renderer.previews.set(el.id, { ...el, ...t })
        this.renderer.invalidate('previews', 'overlay')
        break
      }

      case 'light': {
        this.renderer.previews.set(g.el.id, this.dragLight(g.el, g.part, world, e.altKey))
        this.renderer.invalidate('previews', 'overlay')
        break
      }

      case 'rotate': {
        // Shift snaps to 15° steps.
        const rot = rotationTowards(g.el, world, e.shiftKey ? 15 : 0)
        this.renderer.previews.set(g.el.id, { ...g.el, rot })
        this.renderer.invalidate('previews', 'overlay')
        break
      }

      case 'rotateGroup': {
        const { frame } = g
        let delta = Math.atan2(world.y - frame.y, world.x - frame.x) - g.startAngle
        // Shift snaps to 15° steps.
        if (e.shiftKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12)
        g.delta = delta
        const c = Math.cos(delta)
        const s = Math.sin(delta)
        for (const el of g.originals) {
          const dx = el.x - frame.x
          const dy = el.y - frame.y
          const rot = Math.atan2(Math.sin(el.rot + delta), Math.cos(el.rot + delta))
          this.renderer.previews.set(el.id, { ...el, x: frame.x + dx * c - dy * s, y: frame.y + dx * s + dy * c, rot })
        }
        this.renderer.invalidate('previews')
        this.updateOverlay()
        break
      }

      case 'marquee': {
        if (!g.moved) {
          if (Math.hypot(world.x - g.start.x, world.y - g.start.y) * this.renderer.camera.zoom < DRAG_THRESHOLD) break
          g.moved = true
        }
        const rect = {
          x: Math.min(g.start.x, world.x),
          y: Math.min(g.start.y, world.y),
          w: Math.abs(world.x - g.start.x),
          h: Math.abs(world.y - g.start.y),
        }
        const inside = this.elements.filter((el) => !el.locked && this.pickable(el) && contains(rect, bounds([el])!)).map((el) => el.id)
        this.selection.value = [...new Set([...g.base, ...inside])]
        this.updateOverlay()
        break
      }

      case 'trail':
        if (!g.active) {
          if (Math.hypot(world.x - g.start.x, world.y - g.start.y) * this.renderer.camera.zoom < DRAG_THRESHOLD) break
          g.active = true
          this.presence?.trailTo(g.start)
        }
        this.presence?.trailTo(...(e.getCoalescedEvents?.() ?? [e]).map((ev) => this.toWorld(ev.clientX, ev.clientY)))
        break

      case 'ruler':
        if (this.ruler) this.presence?.setRuler({ a: this.ruler, b: world })
        break

      case 'draw':
        for (const ev of e.getCoalescedEvents?.() ?? [e]) this.addStrokePoint(ev, this.toWorld(ev.clientX, ev.clientY))
        this.updateOverlay()
        break

      case 'shape':
        this.showShapeDraft(world, e)
        break

      case 'wall':
        this.showWallDraft(world, e)
        break

      case 'erase':
        for (const ev of e.getCoalescedEvents?.() ?? [e]) this.eraseAt(this.toWorld(ev.clientX, ev.clientY))
        this.updateOverlay()
        break
    }
  }

  private onPointerUp(e: PointerEvent, cancelled = false) {
    this.pointers.delete(e.pointerId)
    const g = this.gesture
    if (!g) return
    // Lifting one finger of a pinch ends it; the other can't start a new gesture.
    if (g.kind === 'pinch') {
      if (this.pointers.size === 0) this.gesture = null
      this.updateCursor()
      return
    }
    if (cancelled) {
      this.cancelGesture()
      return
    }
    this.gesture = null

    switch (g.kind) {
      case 'move':
      case 'resize':
      case 'rotate':
      case 'rotateGroup':
        this.commitPreviews()
        break

      case 'light': {
        const light = this.renderer.previews.get(g.el.id) as LightElement | undefined
        this.renderer.previews.clear()
        if (light) this.scene.update([[light.id, { w: light.w, h: light.h, bright: light.bright, dim: light.dim } as Partial<SceneElement>]])
        this.renderer.invalidate('elements', 'overlay')
        break
      }

      case 'marquee':
        // A click on a map, not a drag across it.
        if (!g.moved && g.pick) {
          this.selection.value = g.base.includes(g.pick) ? g.base.filter((id) => id !== g.pick) : [...g.base, g.pick]
        }
        break

      case 'draw':
        if (g.points.length) {
          const geo = finishStroke(g.points, g.width)
          this.scene.add({ type: 'drawing', layer: g.layer, colour: g.colour, width: g.width, ...geo })
        }
        this.renderer.draft = null
        break

      case 'ruler':
        this.ruler = null
        this.presence?.setRuler(null)
        break

      case 'trail':
        this.presence?.endTrail()
        break

      case 'erase':
        if (g.erased.size) this.scene.remove(g.erased)
        this.renderer.hidden.clear()
        this.renderer.invalidate('elements')
        break

      case 'wall': {
        this.renderer.draft = null
        this.renderer.invalidate('overlay', 'presence')
        const t = this.wallFrom(g.start, this.toWorld(e.clientX, e.clientY), e)
        if (t.w * this.renderer.camera.zoom >= 4) this.scene.add({ type: 'wall', layer: 'over', ...t })
        break
      }

      case 'shape': {
        this.renderer.draft = null
        this.renderer.invalidate('overlay', 'presence')
        const world = this.toWorld(e.clientX, e.clientY)
        const { label: _label, ...t } = this.shapeFrom(g, world, e)
        if (!g.fixed && (t.w < 4 || t.h < 4)) break
        const style = g.fixed ? TEMPLATE_STYLE : { ...pen.value, width: SHAPE_WIDTH }
        const [id] = this.scene.add({
          type: 'shape',
          shape: g.shape,
          colour: style.colour,
          width: style.width,
          layer: style.layer,
          ...t,
          ...(g.fixed ? { template: true } : {}),
        })
        if (g.fixed) {
          const fixed = g.fixed
          this.placing.value = null
          const tokens = this.elements.filter((el) => el.type === 'token')
          fixed.onPlaced({ id, covered: tokensCovered({ ...t, shape: g.shape }, tokens) })
        }
        break
      }
    }
    this.updateCursor()
    this.updateOverlay()
  }

  private commitPreviews() {
    const previews = this.renderer.previews
    if (!previews.size) return
    const patches = [...previews].map(([id, t]) => [id, { x: t.x, y: t.y, w: t.w, h: t.h, rot: t.rot }] as [string, Transform])
    this.scene.update(patches)
    previews.clear()
    this.renderer.invalidate('elements', 'overlay')
  }

  /** Drop an in-progress gesture without changing the scene. */
  cancelGesture() {
    if (this.area) {
      this.area = null
      this.renderer.draft = null
      this.renderer.invalidate('overlay')
    }
    if (!this.gesture) return
    if (this.gesture.kind === 'trail') this.presence?.endTrail()
    if (this.gesture.kind === 'ruler') {
      this.ruler = null
      this.presence?.setRuler(null)
    }
    this.gesture = null
    this.renderer.previews.clear()
    this.renderer.hidden.clear()
    this.renderer.draft = null
    this.renderer.invalidate('elements', 'overlay')
    this.updateCursor()
  }

  private addStrokePoint(e: PointerEvent, p: Point) {
    const g = this.gesture
    if (g?.kind !== 'draw') return
    const pts = g.points
    const n = pts.length
    // Skip points closer than half a screen px to the last one.
    if (n && Math.hypot(p.x - pts[n - STRIDE], p.y - pts[n - STRIDE + 1]) * this.renderer.camera.zoom < 0.5) return
    pts.push(p.x, p.y, e.pointerType === 'pen' ? e.pressure : 0.5)
    this.renderer.draft = { points: pts, colour: g.colour, width: g.width, layer: g.layer }
  }

  private eraseAt(p: Point) {
    const g = this.gesture
    if (g?.kind !== 'erase') return
    const r = ERASER_RADIUS / this.renderer.camera.zoom
    for (const el of this.elements) {
      if (el.type !== 'drawing' || el.locked || g.erased.has(el.id)) continue
      if (hits(el, p, r)) {
        g.erased.add(el.id)
        this.renderer.hidden.add(el.id)
        this.renderer.invalidate()
      }
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault()
    const at = this.toScreen(e.clientX, e.clientY)
    const lines = e.deltaMode === WheelEvent.DOM_DELTA_LINE
    // Pinching a trackpad sends ctrl + wheel; a mouse wheel sends big whole
    // steps. Both zoom. Two-finger trackpad scrolling pans.
    const mouseWheel = lines || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50)
    if (e.ctrlKey || e.metaKey || mouseWheel) {
      const dy = lines ? e.deltaY * 40 : e.deltaY
      this.zoomBy(Math.exp(-dy * (e.ctrlKey && !mouseWheel ? 0.01 : 0.0015)), at)
    } else {
      const cam = this.renderer.camera
      this.renderer.setCamera({ ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY })
    }
    this.hover = toWorld(this.renderer.camera, at)
    this.updateOverlay()
  }

  // Keyboard

  /** Handle a key press aimed at the canvas; returns true if it was used. */
  onKeyDown(e: KeyboardEvent): boolean {
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
    const grid = this.renderer.grid

    if (key === ' ' && !mod) {
      if (!this.spaceHeld) {
        this.spaceHeld = true
        this.updateCursor()
      }
      return true
    }
    if (mod && key === 'z') {
      this.cancelGesture()
      if (e.shiftKey) this.scene.undo.redo()
      else this.scene.undo.undo()
      return true
    }
    if (mod && key === 'y') {
      this.scene.undo.redo()
      return true
    }
    if (mod && key === 'a') {
      if (!this.selecting()) activeTool.value = 'select'
      this.selection.value = this.elements.filter((el) => !el.locked && this.pickable(el)).map((el) => el.id)
      return true
    }
    if (mod && key === 'd') {
      this.duplicate(this.selection.value)
      return true
    }
    if (mod) return false

    switch (e.key) {
      case 'Enter':
        if (!this.area) return false
        this.finishArea()
        return true
      case 'Escape':
        if (this.gesture || this.area) this.cancelGesture()
        else this.selection.value = []
        return true
      case 'Delete':
      case 'Backspace':
        this.remove(this.selection.value)
        return true
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        const step = e.shiftKey ? (grid.type === 'none' ? 10 : grid.size) : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const sel = this.selected().filter((el) => !el.locked)
        if (!sel.length) return false
        this.scene.update(sel.map((el) => [el.id, { x: el.x + dx, y: el.y + dy }]))
        return true
      }
      case '=':
      case '+':
        this.zoomBy(1.25)
        return true
      case '-':
      case '_':
        this.zoomBy(0.8)
        return true
    }
    // By key position, so Shift + digit works on any keyboard layout.
    if (e.shiftKey && e.code === 'Digit1') {
      this.fit()
      return true
    }
    if (e.shiftKey && e.code === 'Digit0') {
      this.zoomTo(1)
      return true
    }
    return false
  }

  onKeyUp(e: KeyboardEvent) {
    if (e.key === ' ') {
      this.spaceHeld = false
      this.updateCursor()
    }
  }

  /** The window lost focus, so keys may have been released unseen. */
  onBlur() {
    this.spaceHeld = false
    this.updateCursor()
  }

  // Edits, for menus and shortcuts

  remove(ids: string[]) {
    const removable = ids.filter((id) => this.byId.get(id) && !this.byId.get(id)!.locked)
    if (!removable.length) return
    this.scene.remove(removable)
    this.selection.value = this.selection.value.filter((id) => !removable.includes(id))
  }

  duplicate(ids: string[]) {
    if (!ids.length) return
    const grid = this.renderer.grid
    const copies = this.scene.duplicate(ids, grid.type === 'none' ? 20 : grid.size)
    this.afterDuplicate(copies)
    this.selection.value = copies
  }

  /** Called with new duplicates, so the table can give a template's token a copy of its own. */
  afterDuplicate: (ids: string[]) => void = () => {}

  setLocked(ids: string[], locked: boolean) {
    this.scene.update(ids.map((id) => [id, { locked }]))
  }

  restack(ids: string[], to: 'front' | 'back') {
    this.scene.restack(ids, to)
  }

  setLayer(ids: string[], layer: Layer) {
    this.scene.setLayer(ids, layer)
  }

  /**
   * Change a token's name, style and colour as one undo step; with `cells`,
   * also make it that many cells across, snapped to the grid.
   */
  updateToken(
    id: string,
    patch: Partial<Pick<TokenElement, 'name' | 'style' | 'colour' | 'characterId' | 'image' | 'hideName' | 'hideBars'>>,
    cells?: number,
  ) {
    const el = this.byId.get(id)
    const grid = this.renderer.grid
    const size = cells && el ? cells * grid.size : 0
    const resize = size && el && (Math.abs(el.w - size) > 0.5 || Math.abs(el.h - size) > 0.5)
    this.scene.update([[id, resize ? { ...patch, ...snapPoint(grid, el, cells), w: size, h: size } : patch]])
  }

  /** The names of every token on the scene, for naming new ones apart. */
  tokenNames(): string[] {
    return this.elements.flatMap((el) => (el.type === 'token' ? [el.name] : []))
  }

  /** Swap an image between being a map and being a token. */
  convert(id: string, to: 'map' | 'token') {
    const el = this.byId.get(id)
    if (!el || el.type === to || !('image' in el) || !el.image) return
    const image = el.image
    const grid = this.renderer.grid
    if (to === 'token') {
      const size = snapSize(grid, Math.min(el.w, el.h, grid.size))
      const p = snapPoint(grid, el, Math.round(size / grid.size))
      const token = { type: 'token', name: '', colour: memberColour(), style: this.defaults().tokenStyle, ...p, w: size, h: size, rot: 0 }
      this.scene.update([[id, token as Partial<SceneElement>]])
    } else {
      const k = el.w / Math.max(image.width, image.height)
      const map = { type: 'map', name: undefined, colour: undefined, style: undefined, w: image.width * k, h: image.height * k }
      this.scene.update([[id, map as Partial<SceneElement>]])
    }
    this.scene.setLayer([id], to)
  }

  addToken(at: Point, name = '') {
    const grid = this.renderer.grid
    const size = grid.type === 'none' ? 70 : grid.size
    const p = snapPoint(grid, at)
    const [id] = this.scene.add({
      type: 'token',
      layer: 'token',
      name,
      colour: memberColour(),
      style: this.defaults().tokenStyle,
      ...p,
      w: size,
      h: size,
      rot: 0,
    })
    activeTool.value = 'select'
    this.selection.value = [id]
    return id
  }

  /** A token standing for a character, at a world point. */
  addCharacterToken(
    at: Point,
    spec: { characterId: string; name: string; image?: BlobRef; style?: TokenStyle; colour?: string },
  ) {
    const grid = this.renderer.grid
    const size = grid.type === 'none' ? 70 : grid.size
    const [id] = this.scene.add({
      type: 'token',
      layer: 'token',
      name: spec.name,
      characterId: spec.characterId,
      image: spec.image,
      colour: spec.colour ?? memberColour(),
      style: spec.style ?? (spec.image ? this.defaults().tokenStyle : 'disc'),
      ...snapPoint(grid, at),
      w: size,
      h: size,
      rot: 0,
    })
    activeTool.value = 'select'
    this.selection.value = [id]
    return id
  }

  /**
   * Import image files at a world point. Small, squarish images become
   * tokens; anything else is placed as a map at its own size.
   */
  async importFiles(files: Iterable<File>, at: Point) {
    const images = [...files].filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    this.host.style.cursor = 'progress'
    const grid = this.renderer.grid
    const added: NewElement[] = []
    try {
      for (const [i, file] of images.entries()) {
        let image: BlobRef
        try {
          image = await importImage(file)
        } catch (err) {
          console.warn(`Couldn't import ${file.name}`, err)
          continue
        }
        const shift = i * (grid.type === 'none' ? 40 : grid.size)
        const p = { x: at.x + shift, y: at.y + shift }
        const ratio = image.width / image.height
        if (Math.max(image.width, image.height) <= 512 && ratio > 0.8 && ratio < 1.25) {
          const size = grid.type === 'none' ? 70 : grid.size
          added.push({
            type: 'token',
            layer: 'token',
            image,
            name: tokenName(file.name),
            colour: memberColour(),
            style: this.defaults().tokenStyle,
            ...snapPoint(grid, p),
            w: size,
            h: size,
            rot: 0,
          })
        } else {
          added.push({ type: 'map', layer: 'map', image, ...p, w: image.width, h: image.height, rot: 0 })
        }
      }
    } finally {
      this.updateCursor()
    }
    if (!added.length) return
    activeTool.value = 'select'
    this.selection.value = this.scene.add(...added)
  }

  layers() {
    return LAYERS
  }
}

/** "goblin_archer-2.png" → "Goblin archer 2" */
function tokenName(file: string): string {
  const base = file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  return base ? base[0].toUpperCase() + base.slice(1) : ''
}

/** Resize to exactly w × h, keeping the corner opposite `corner` fixed. */
function resizeToSize(t: Transform, corner: Corner, w: number, h: number): Transform {
  const sign = CORNER_SIGNS[corner]
  const anchor = fromLocal(t, { x: (-sign.x * t.w) / 2, y: (-sign.y * t.h) / 2 })
  const c = Math.cos(t.rot)
  const s = Math.sin(t.rot)
  const lx = (sign.x * w) / 2
  const ly = (sign.y * h) / 2
  return { ...t, x: anchor.x + lx * c - ly * s, y: anchor.y + lx * s + ly * c, w, h }
}

/** A resize cursor that matches the corner's direction once rotated. */
function cornerCursor(t: Transform, corner: Corner): string {
  const turns = Math.round(t.rot / (Math.PI / 2))
  return RESIZE_CURSORS[(((corner + turns) % 4) + 4) % 4]
}
